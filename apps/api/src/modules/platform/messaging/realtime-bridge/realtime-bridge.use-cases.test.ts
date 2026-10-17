import { beforeEach, describe, expect, it } from 'vitest';
import type { Message } from '@parla/types';
import { NotFoundError } from '../../../../kernel/domain-error';
import { PresenceRegistry } from '../../../../infra/realtime/presence.registry';
import {
  InMemoryAuthRepository,
  InMemoryConversationsRepository,
  InMemoryPushSubscriptions,
  makeUser,
  RecordingPushSender,
  RecordingRealtime,
} from '../../../../testing/in-memory.fakes';
import { GetConversationUseCase } from '../conversations/use-cases/get-conversation.use-case';
import { MarkDeliveredUseCase } from '../conversations/use-cases/receipts.use-case';
import { SendMessageUseCase } from '../conversations/use-cases/send-message.use-case';
import { ConversationEvents } from '../conversations/conversation-events';
import { NotificationDispatcher } from '../push/use-cases/notification-dispatcher';
import {
  ConversationContextUseCase,
  LogCallUseCase,
  NotifyIncomingCallUseCase,
  PresenceChangedUseCase,
} from './use-cases/realtime-bridge.use-cases';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('puente con el tiempo real (Elixir)', () => {
  const laura = makeUser({ displayName: 'Laura' });
  const andres = makeUser({ displayName: 'Andrés' });
  const sofia = makeUser({ displayName: 'Sofía' });
  const externo = makeUser({ displayName: 'Externo' });
  let users: InMemoryAuthRepository;
  let repo: InMemoryConversationsRepository;
  let realtime: RecordingRealtime;
  let presence: PresenceRegistry;
  let push: RecordingPushSender;
  let send: SendMessageUseCase;
  let dispatcher: NotificationDispatcher;

  beforeEach(async () => {
    users = new InMemoryAuthRepository();
    users.users.push(laura, andres, sofia, externo);
    repo = new InMemoryConversationsRepository();
    repo.addConversation('c1', [laura, andres, sofia]);
    users.contacts.set(laura.id, [andres.id, sofia.id]);
    realtime = new RecordingRealtime();
    presence = new PresenceRegistry();
    const subs = new InMemoryPushSubscriptions();
    await subs.save({ userId: sofia.id, endpoint: 'https://push.example/s', p256dh: 'k', auth: 'a' });
    push = new RecordingPushSender();
    dispatcher = new NotificationDispatcher(subs, push, presence);
    const get = new GetConversationUseCase(repo, presence);
    send = new SendMessageUseCase(repo, realtime, get, dispatcher);
  });

  it('al conectarse queda en línea, recibe lo pendiente y sus contactos se enteran', async () => {
    await send.execute(andres.id, 'c1', { clientId: 'm1', kind: 'text', body: { ciphertext: 'x', iv: 'y' }, media: null });
    const events = new ConversationEvents(repo, realtime, presence);
    const markDelivered = new MarkDeliveredUseCase(repo, new GetConversationUseCase(repo, presence), events);
    const presenceChanged = new PresenceChangedUseCase(presence, markDelivered, users, realtime);

    await presenceChanged.execute(laura.id, 'online', new Date());
    expect(presence.statusOf(laura.id)).toBe('online');
    expect(repo.messages[0].receipts.find((r) => r.userId === laura.id)?.deliveredAt).toBeInstanceOf(Date);

    const at = new Date('2026-10-17T12:00:00Z');
    await presenceChanged.execute(laura.id, 'offline', at);
    expect(presence.statusOf(laura.id)).toBe('offline');
    expect(users.users[0].lastSeenAt).toEqual(at);
    expect(realtime.events('presence').at(-1)?.userIds).toEqual([andres.id, sofia.id]);
    expect(realtime.events('presence').at(-1)?.payload).toEqual({ userId: laura.id, presence: 'offline', lastSeenAt: at.toISOString() });
  });

  it('el contexto de la conversación solo se entrega a sus participantes, con el máximo por llamada', async () => {
    const context = new ConversationContextUseCase(repo);
    const result = await context.execute('c1', andres.id);
    expect(result.participants.map((p) => p.id)).toEqual([laura.id, andres.id, sofia.id]);
    expect(result.maxCallParticipants).toBe(8);
    await expect(context.execute('c1', externo.id)).rejects.toThrow(NotFoundError);
  });

  it('el registro de la llamada queda en el chat y solo llega a participantes', async () => {
    await new LogCallUseCase(repo, send).execute('c1', laura.id, '🎥 Videollamada · 3:05', [laura.id, andres.id, externo.id]);
    const event = realtime.events('message:new').at(-1)!;
    expect((event.payload as Message).systemText).toBe('🎥 Videollamada · 3:05');
    expect(event.userIds).toEqual([laura.id, andres.id]);
    await expect(new LogCallUseCase(repo, send).execute('no-existe', laura.id, 'x', [])).rejects.toThrow(NotFoundError);
  });

  it('el push de llamada entrante va solo a participantes desconectados', async () => {
    presence.set(andres.id, 'online');
    await new NotifyIncomingCallUseCase(repo, dispatcher).execute({
      conversationId: 'c1', callerId: laura.id, callId: 'k1', kind: 'video', recipients: [andres.id, sofia.id, externo.id],
    });
    await flush();
    expect(push.sent.map((s) => [s.target.endpoint, s.payload.body, s.payload.tag])).toEqual([
      ['https://push.example/s', 'Laura te está llamando · Videollamada', 'call-k1'],
    ]);
    await expect(
      new NotifyIncomingCallUseCase(repo, dispatcher).execute({ conversationId: 'c1', callerId: externo.id, callId: 'k2', kind: 'audio', recipients: [] }),
    ).rejects.toThrow(NotFoundError);
  });
});
