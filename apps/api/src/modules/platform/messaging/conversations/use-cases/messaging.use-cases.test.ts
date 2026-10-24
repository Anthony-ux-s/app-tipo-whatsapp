import { beforeEach, describe, expect, it } from 'vitest';
import type { Message, MessageStatusUpdate } from '@parla/types';
import { NotFoundError, ValidationError } from '../../../../../kernel/domain-error';
import { PresenceRegistry } from '../../../../../infra/realtime/presence.registry';
import {
  InMemoryConversationsRepository,
  InMemoryPushSubscriptions,
  makeUser,
  RecordingPushSender,
  RecordingRealtime,
} from '../../../../../testing/in-memory.fakes';
import { NotificationDispatcher } from '../../push/use-cases/notification-dispatcher';
import { ConversationEvents } from '../conversation-events';
import { assertKeysCover, directKeyFor } from '../domain/conversation-rules';
import { GetConversationUseCase } from './get-conversation.use-case';
import { MarkDeliveredUseCase, MarkReadUseCase } from './receipts.use-case';
import { SendMessageUseCase } from './send-message.use-case';

const body = { ciphertext: 'Y2lmcmFkbw==', iv: 'aXY=' };

describe('mensajería', () => {
  const laura = makeUser({ displayName: 'Laura' });
  const andres = makeUser({ displayName: 'Andrés' });
  const sofia = makeUser({ displayName: 'Sofía' });
  const intruso = makeUser({ displayName: 'Intruso' });
  let repo: InMemoryConversationsRepository;
  let realtime: RecordingRealtime;
  let send: SendMessageUseCase;
  let markRead: MarkReadUseCase;
  let markDelivered: MarkDeliveredUseCase;

  beforeEach(() => {
    repo = new InMemoryConversationsRepository();
    repo.addConversation('c1', [laura, andres, sofia]);
    realtime = new RecordingRealtime();
    const presence = new PresenceRegistry();
    const get = new GetConversationUseCase(repo, presence);
    const events = new ConversationEvents(repo, realtime, presence);
    const dispatcher = new NotificationDispatcher(new InMemoryPushSubscriptions(), new RecordingPushSender(), presence);
    send = new SendMessageUseCase(repo, realtime, get, dispatcher);
    markRead = new MarkReadUseCase(repo, get, events);
    markDelivered = new MarkDeliveredUseCase(repo, get, events);
  });

  it('entrega el mensaje cifrado en tiempo real a todos los participantes', async () => {
    const message = await send.execute(laura.id, 'c1', { clientId: 'a1', kind: 'text', body, media: null });
    expect(message.status).toBe('sent');
    expect(message.body).toEqual(body);
    const [event] = realtime.events('message:new');
    expect(event.userIds).toEqual([laura.id, andres.id, sofia.id]);
  });

  it('es idempotente: reenviar el mismo clientId no duplica el mensaje', async () => {
    const a = await send.execute(laura.id, 'c1', { clientId: 'dup', kind: 'text', body, media: null });
    const b = await send.execute(laura.id, 'c1', { clientId: 'dup', kind: 'text', body, media: null });
    expect(b.id).toBe(a.id);
    expect(repo.messages).toHaveLength(1);
  });

  it('quien no participa no puede escribir ni enterarse de que el chat existe (404)', async () => {
    await expect(send.execute(intruso.id, 'c1', { clientId: 'x', kind: 'text', body, media: null })).rejects.toThrow(NotFoundError);
  });

  it('valida el contenido según el tipo de mensaje', async () => {
    await expect(send.execute(laura.id, 'c1', { clientId: 'v1', kind: 'text', body: null, media: null })).rejects.toThrow(ValidationError);
    await expect(send.execute(laura.id, 'c1', { clientId: 'v2', kind: 'image', body: null, media: null })).rejects.toThrow(ValidationError);
    repo.files.push({ id: 'f1', conversationId: 'otro-chat', uploaderId: laura.id });
    const media = { fileId: 'f1', mimeType: 'image/png', size: 10, iv: 'aXY=' };
    await expect(send.execute(laura.id, 'c1', { clientId: 'v3', kind: 'image', body: null, media })).rejects.toThrow('El archivo no pertenece a esta conversación');
    repo.files.push({ id: 'f2', conversationId: 'c1', uploaderId: laura.id });
    const audio = { ...media, fileId: 'f2' };
    await expect(send.execute(laura.id, 'c1', { clientId: 'v4', kind: 'image', body: null, media: audio })).resolves.toMatchObject({ kind: 'image' });
    await expect(send.execute(laura.id, 'c1', { clientId: 'v5', kind: 'audio', body: null, media: audio })).rejects.toThrow('El tipo de archivo no coincide');
    // El sticker viaja cifrado como el texto: el servidor no sabe cuál es
    await expect(send.execute(laura.id, 'c1', { clientId: 'v6', kind: 'sticker', body, media: null })).resolves.toMatchObject({ kind: 'sticker', body });
    await expect(send.execute(laura.id, 'c1', { clientId: 'v7', kind: 'sticker', body: null, media: null })).rejects.toThrow(ValidationError);
    await expect(send.execute(laura.id, 'c1', { clientId: 'v8', kind: 'sticker', body, media: audio })).rejects.toThrow('Un sticker no lleva archivo');
  });

  it('enviado → entregado → leído: el remitente recibe cada cambio y en grupos manda el más atrasado', async () => {
    const message = await send.execute(laura.id, 'c1', { clientId: 's1', kind: 'text', body, media: null });
    const statuses = () => realtime.events('message:status').map((e) => (e.payload as MessageStatusUpdate).status);

    await markDelivered.execute(andres.id, 'c1', [message.id]);
    expect(statuses()).toEqual(['sent']); // Sofía aún no lo recibe

    await markDelivered.everythingPending(sofia.id);
    expect(statuses().at(-1)).toBe('delivered');

    await markRead.execute(andres.id, 'c1');
    expect(statuses().at(-1)).toBe('delivered'); // falta que Sofía lo lea

    await markRead.execute(sofia.id, 'c1');
    const last = realtime.events('message:status').at(-1)!;
    expect(last.userIds).toEqual([laura.id]);
    expect(last.payload).toEqual({ conversationId: 'c1', messageIds: [message.id], status: 'read' });
  });

  it('marcar como leído dos veces no genera avisos repetidos', async () => {
    await send.execute(laura.id, 'c1', { clientId: 'r1', kind: 'text', body, media: null });
    expect(await markRead.execute(andres.id, 'c1')).toEqual({ updated: 1 });
    expect(await markRead.execute(andres.id, 'c1')).toEqual({ updated: 0 });
  });

  it('los mensajes de sistema van en claro y sin recibos', async () => {
    await send.postSystem('c1', laura.id, 'Laura creó el grupo', [andres.id]);
    const payload = realtime.events('message:new')[0].payload as Message;
    expect(payload).toMatchObject({ kind: 'system', systemText: 'Laura creó el grupo', body: null, status: 'read' });
  });
});

describe('entregado desde el servidor', () => {
  const laura = makeUser({ displayName: 'Laura' });
  const andres = makeUser({ displayName: 'Andrés' });
  const sofia = makeUser({ displayName: 'Sofía' });
  let repo: InMemoryConversationsRepository;
  let realtime: RecordingRealtime;
  let presence: PresenceRegistry;
  let send: SendMessageUseCase;

  beforeEach(() => {
    repo = new InMemoryConversationsRepository();
    repo.addConversation('direct', [laura, andres]);
    repo.addConversation('group', [laura, andres, sofia]);
    realtime = new RecordingRealtime();
    presence = new PresenceRegistry();
    const get = new GetConversationUseCase(repo, presence);
    const dispatcher = new NotificationDispatcher(new InMemoryPushSubscriptions(), new RecordingPushSender(), presence);
    send = new SendMessageUseCase(repo, realtime, get, dispatcher, presence);
  });

  it('si el receptor está conectado, el mensaje nace «entregado»: el remitente lo ve así en la misma respuesta, sin otro aviso', async () => {
    presence.set(andres.id, 'online');
    const message = await send.execute(laura.id, 'direct', { clientId: 'e1', kind: 'text', body, media: null });
    expect(message.status).toBe('delivered');
    expect((realtime.events('message:new')[0].payload as Message).status).toBe('delivered');
    expect(realtime.events('message:status')).toHaveLength(0);
  });

  it('si no está conectado queda «enviado» hasta que su celular lo reciba', async () => {
    const message = await send.execute(laura.id, 'direct', { clientId: 'e2', kind: 'text', body, media: null });
    expect(message.status).toBe('sent');
    expect(repo.messages[0].receipts.every((r) => r.deliveredAt === null)).toBe(true);
  });

  it('en un grupo solo cuenta «entregado» cuando todos están conectados; los que no, lo reciben después', async () => {
    presence.set(andres.id, 'online');
    const partial = await send.execute(laura.id, 'group', { clientId: 'e3', kind: 'text', body, media: null });
    expect(partial.status).toBe('sent');
    const receipts = repo.messages.find((m) => m.id === partial.id)!.receipts;
    expect(receipts.find((r) => r.userId === andres.id)!.deliveredAt).toBeTruthy();
    expect(receipts.find((r) => r.userId === sofia.id)!.deliveredAt).toBeNull();
    presence.set(sofia.id, 'online');
    expect((await send.execute(laura.id, 'group', { clientId: 'e4', kind: 'text', body, media: null })).status).toBe('delivered');
  });

  it('el mensaje de uno mismo no se marca para uno mismo, y un reintento no cambia el estado ya guardado', async () => {
    presence.set(laura.id, 'online');
    const first = await send.execute(laura.id, 'direct', { clientId: 'e5', kind: 'text', body, media: null });
    expect(first.status).toBe('sent');
    presence.set(andres.id, 'online');
    const again = await send.execute(laura.id, 'direct', { clientId: 'e5', kind: 'text', body, media: null });
    expect(again.id).toBe(first.id);
    expect(repo.messages).toHaveLength(1);
  });
});

describe('reglas de conversación', () => {
  it('el chat individual entre dos personas tiene una sola clave estable', () => {
    expect(directKeyFor('b', 'a')).toBe(directKeyFor('a', 'b'));
  });

  it('exige una clave envuelta por participante, envuelta por quien actúa', () => {
    const key = (userId: string, by = 'a') => ({ userId, wrappedKey: 'k', iv: 'i', wrappedById: by });
    expect(() => assertKeysCover([key('a'), key('b')], ['a', 'b'], 'a')).not.toThrow();
    expect(() => assertKeysCover([key('a')], ['a', 'b'], 'a')).toThrow(ValidationError);
    expect(() => assertKeysCover([key('a'), key('a')], ['a', 'b'], 'a')).toThrow(ValidationError);
    expect(() => assertKeysCover([key('a'), key('b', 'x')], ['a', 'b'], 'a')).toThrow(ValidationError);
  });
});
