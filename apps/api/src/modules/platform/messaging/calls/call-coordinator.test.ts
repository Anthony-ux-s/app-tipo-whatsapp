import type { CallInfo, Message } from '@parla/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callLogText } from '../../../../kernel/call-rules';
import { ConflictError, NotFoundError } from '../../../../kernel/domain-error';
import { PresenceRegistry } from '../../../../infra/realtime/presence.registry';
import {
  InMemoryConversationsRepository,
  InMemoryPushSubscriptions,
  InMemoryWorkspacesRepository,
  makeUser,
  RecordingPushSender,
  RecordingRealtime,
} from '../../../../testing/in-memory.fakes';
import { GetConversationUseCase } from '../conversations/use-cases/get-conversation.use-case';
import { SendMessageUseCase } from '../conversations/use-cases/send-message.use-case';
import { NotificationDispatcher } from '../push/use-cases/notification-dispatcher';
import { CallCoordinator } from './use-cases/call-coordinator';

const sdp = { type: 'offer' as const, sdp: 'v=0' };

describe('llamadas de voz y video (señalización)', () => {
  const laura = makeUser({ displayName: 'Laura' });
  const andres = makeUser({ displayName: 'Andrés' });
  const sofia = makeUser({ displayName: 'Sofía' });
  let repo: InMemoryConversationsRepository;
  let realtime: RecordingRealtime;
  let push: RecordingPushSender;
  let calls: CallCoordinator;

  beforeEach(async () => {
    vi.useFakeTimers();
    repo = new InMemoryConversationsRepository();
    repo.addConversation('dm', [laura, andres], 'direct');
    repo.addConversation('grupo', [laura, andres, sofia]);
    const workspaces = new InMemoryWorkspacesRepository();
    realtime = new RecordingRealtime();
    const presence = new PresenceRegistry();
    presence.connect(laura.id);
    presence.connect(andres.id);
    const subs = new InMemoryPushSubscriptions();
    await subs.save({ userId: sofia.id, endpoint: 'https://push.example/s', p256dh: 'k', auth: 'a' });
    push = new RecordingPushSender();
    const dispatcher = new NotificationDispatcher(subs, push, presence);
    const send = new SendMessageUseCase(repo, realtime, new GetConversationUseCase(repo, presence), dispatcher);
    calls = new CallCoordinator(repo, workspaces, realtime, send, dispatcher);
  });

  afterEach(() => {
    calls.onModuleDestroy();
    vi.useRealTimers();
  });

  const systemTexts = () => repo.messages.filter((m) => m.kind === 'system').map((m) => m.systemText);

  it('llamar hace sonar a los demás; contestar conecta y quien entra recibe con quién negociar', async () => {
    const call = await calls.start(laura.id, 's-laura', { conversationId: 'dm', kind: 'video' });
    expect(realtime.events('call:incoming')[0]).toMatchObject({ userIds: [andres.id], payload: { call: { kind: 'video', startedBy: laura.id } } });

    const joined = await calls.join(andres.id, 's-andres', call.callId);
    expect(joined.participants).toEqual([laura.id]);
    expect(realtime.events('call:participant-joined')[0]).toMatchObject({ userIds: ['socket:s-laura'], payload: { userId: andres.id } });
  });

  it('las ofertas y candidatos solo se reenvían entre personas que están en la llamada', async () => {
    const call = await calls.start(laura.id, 's-laura', { conversationId: 'dm', kind: 'audio' });
    calls.relay(laura.id, call.callId, andres.id, sdp); // Andrés aún no contestó
    expect(realtime.events('call:signal')).toHaveLength(0);
    await calls.join(andres.id, 's-andres', call.callId);
    calls.relay(andres.id, call.callId, laura.id, sdp);
    expect(realtime.events('call:signal')[0]).toMatchObject({ userIds: ['socket:s-laura'], payload: { from: andres.id, data: sdp } });
    calls.relay(andres.id, call.callId, laura.id, { type: 'offer', sdp: 'x'.repeat(200_000) });
    expect(realtime.events('call:signal')).toHaveLength(1);
  });

  it('al colgar queda en el chat la duración de la llamada', async () => {
    const call = await calls.start(laura.id, 's-laura', { conversationId: 'dm', kind: 'video' });
    await calls.join(andres.id, 's-andres', call.callId);
    vi.advanceTimersByTime(65_000);
    calls.leave(andres.id, call.callId);
    await vi.runAllTimersAsync();
    expect(realtime.events('call:ended').at(-1)?.payload).toEqual({ callId: call.callId, reason: 'completed' });
    expect(systemTexts()).toEqual(['🎥 Videollamada · 1:05']);
    expect(calls.activeCallOf(laura.id)).toBeNull();
  });

  it('si nadie contesta en 45 s, se registra como perdida', async () => {
    await calls.start(laura.id, 's-laura', { conversationId: 'dm', kind: 'audio' });
    await vi.advanceTimersByTimeAsync(45_001);
    expect(realtime.events('call:ended')[0].payload).toMatchObject({ reason: 'missed' });
    expect(systemTexts()).toEqual(['📞 Llamada de voz perdida']);
  });

  it('rechazar un chat individual termina la llamada', async () => {
    const call = await calls.start(laura.id, 's-laura', { conversationId: 'dm', kind: 'audio' });
    calls.decline(andres.id, call.callId);
    await vi.runAllTimersAsync();
    expect(realtime.events('call:declined')[0].userIds).toEqual(['socket:s-laura']);
    expect(realtime.events('call:ended')[0].payload).toMatchObject({ reason: 'declined' });
  });

  it('en grupo, quien llega después se une a la llamada en curso', async () => {
    const call = await calls.start(laura.id, 's-laura', { conversationId: 'grupo', kind: 'video' });
    await calls.join(andres.id, 's-andres', call.callId);
    const again: CallInfo = await calls.start(sofia.id, 's-sofia', { conversationId: 'grupo', kind: 'audio' });
    expect(again.callId).toBe(call.callId);
    expect(again.participants).toEqual([laura.id, andres.id]);
  });

  it('no se puede estar en dos llamadas, ni llamar a un chat ajeno', async () => {
    await calls.start(laura.id, 's-laura', { conversationId: 'dm', kind: 'audio' });
    await expect(calls.start(laura.id, 's-laura-2', { conversationId: 'grupo', kind: 'audio' })).rejects.toThrow(ConflictError);
    await expect(calls.start(makeUser().id, 's-x', { conversationId: 'dm', kind: 'audio' })).rejects.toThrow(NotFoundError);
  });

  it('si se cae la conexión, la persona sale de la llamada', async () => {
    const call = await calls.start(laura.id, 's-laura', { conversationId: 'dm', kind: 'audio' });
    await calls.join(andres.id, 's-andres', call.callId);
    calls.socketClosed('s-andres');
    await vi.runAllTimersAsync();
    expect(realtime.events('call:participant-left')[0].payload).toEqual({ callId: call.callId, userId: andres.id });
    expect(realtime.events('call:ended')[0].payload).toMatchObject({ reason: 'completed' });
  });

  it('a quien está desconectado le llega un push de llamada entrante', async () => {
    await calls.start(laura.id, 's-laura', { conversationId: 'grupo', kind: 'video' });
    await vi.runAllTimersAsync();
    expect(push.sent.map((s) => s.payload.body)).toEqual(['Laura te está llamando · Videollamada']);
  });

  it('texto del registro de llamada', () => {
    expect(callLogText('audio', true, 3_725_000)).toBe('📞 Llamada de voz · 1:02:05');
    expect(callLogText('video', false, 0)).toBe('🎥 Videollamada perdida');
    expect(repo.messages.filter((m: { kind: Message['kind'] }) => m.kind === 'system')).toHaveLength(0);
  });
});
