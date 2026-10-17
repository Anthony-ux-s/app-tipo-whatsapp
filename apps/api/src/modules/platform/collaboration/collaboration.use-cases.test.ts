import { beforeEach, describe, expect, it } from 'vitest';
import { messagePush, sanitizeMentions, threadRootOf } from '../../../kernel/collaboration-rules';
import { NotFoundError, ValidationError } from '../../../kernel/domain-error';
import { PresenceRegistry } from '../../../infra/realtime/presence.registry';
import {
  InMemoryConversationsRepository,
  InMemoryPushSubscriptions,
  makeUser,
  RecordingPushSender,
  RecordingRealtime,
} from '../../../testing/in-memory.fakes';
import { GetConversationUseCase } from '../messaging/conversations/use-cases/get-conversation.use-case';
import { GetThreadUseCase } from '../messaging/conversations/use-cases/get-thread.use-case';
import { SendMessageUseCase } from '../messaging/conversations/use-cases/send-message.use-case';
import { NotificationDispatcher } from '../messaging/push/use-cases/notification-dispatcher';

const body = { ciphertext: 'Y2lmcmFkbw==', iv: 'aXY=' };
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Fase 3: hilos, menciones y notificaciones push', () => {
  const laura = makeUser({ displayName: 'Laura Méndez' });
  const andres = makeUser({ displayName: 'Andrés Rojas' });
  const sofia = makeUser({ displayName: 'Sofía Ramírez' });
  const externo = makeUser({ displayName: 'Externo' });

  let repo: InMemoryConversationsRepository;
  let realtime: RecordingRealtime;
  let presence: PresenceRegistry;
  let subs: InMemoryPushSubscriptions;
  let sender: RecordingPushSender;
  let send: SendMessageUseCase;
  let thread: GetThreadUseCase;

  beforeEach(async () => {
    repo = new InMemoryConversationsRepository();
    repo.addConversation('c1', [laura, andres, sofia]);
    repo.addConversation('otro', [laura, externo]);
    realtime = new RecordingRealtime();
    presence = new PresenceRegistry();
    subs = new InMemoryPushSubscriptions();
    sender = new RecordingPushSender();
    for (const u of [laura, andres, sofia]) {
      await subs.save({ userId: u.id, endpoint: `https://push.example/${u.id}`, p256dh: 'k', auth: 'a' });
    }
    const get = new GetConversationUseCase(repo, presence);
    const dispatcher = new NotificationDispatcher(subs, sender, presence);
    send = new SendMessageUseCase(repo, realtime, get, dispatcher);
    thread = new GetThreadUseCase(repo, get);
  });

  describe('hilos de respuesta', () => {
    it('responder a una respuesta cuelga del mismo mensaje raíz y avisa el nuevo total', async () => {
      const root = await send.execute(laura.id, 'c1', { clientId: 'r', kind: 'text', body, media: null });
      const first = await send.execute(andres.id, 'c1', { clientId: 'r1', kind: 'text', body, media: null, replyToId: root.id });
      const second = await send.execute(sofia.id, 'c1', { clientId: 'r2', kind: 'text', body, media: null, replyToId: first.id });

      expect(first.replyTo?.id).toBe(root.id);
      expect(second.replyTo?.id).toBe(root.id);
      expect(realtime.events('message:replies').at(-1)?.payload).toEqual({ conversationId: 'c1', messageId: root.id, replyCount: 2 });

      const page = await thread.execute(laura.id, 'c1', second.id);
      expect(page.root.id).toBe(root.id);
      expect(page.replies.map((m) => m.id)).toEqual([first.id, second.id]);
    });

    it('no se responde a mensajes de otra conversación ni a avisos del sistema', async () => {
      const ajeno = await send.execute(laura.id, 'otro', { clientId: 'x', kind: 'text', body, media: null });
      await expect(
        send.execute(laura.id, 'c1', { clientId: 'y', kind: 'text', body, media: null, replyToId: ajeno.id }),
      ).rejects.toThrow(ValidationError);
      expect(() => threadRootOf({ id: 's', kind: 'system', replyTo: null })).toThrow(ValidationError);
    });

    it('quien no participa no puede leer el hilo', async () => {
      const root = await send.execute(laura.id, 'c1', { clientId: 'r', kind: 'text', body, media: null });
      await expect(thread.execute(externo.id, 'c1', root.id)).rejects.toThrow(NotFoundError);
    });
  });

  describe('menciones', () => {
    it('solo se guardan menciones a participantes, sin repetir y sin mencionarse a uno mismo', async () => {
      const message = await send.execute(laura.id, 'c1', {
        clientId: 'm',
        kind: 'text',
        body,
        media: null,
        mentions: [andres.id, andres.id, laura.id, externo.id],
      });
      expect(message.mentions).toEqual([andres.id]);
      expect(sanitizeMentions(undefined, [laura.id], laura.id)).toEqual([]);
    });
  });

  describe('notificaciones push', () => {
    it('solo reciben push quienes no tienen la app abierta, y la mención se nota en el aviso', async () => {
      presence.set(sofia.id, 'online'); // Sofía está en línea: el socket ya le entrega el mensaje
      await send.execute(laura.id, 'c1', { clientId: 'p', kind: 'text', body, media: null, mentions: [andres.id] });
      await flush();
      expect(sender.sent.map((s) => s.target.endpoint)).toEqual([`https://push.example/${andres.id}`]);
      expect(sender.sent[0].payload).toEqual({
        title: 'Equipo',
        body: 'Laura Méndez te mencionó',
        url: '/app/c/c1',
        tag: 'c1',
      });
    });

    it('el aviso nunca lleva el contenido del mensaje (va cifrado de extremo a extremo)', async () => {
      await send.execute(laura.id, 'c1', { clientId: 'q', kind: 'image', body, media: null }).catch(() => undefined);
      await send.execute(laura.id, 'c1', { clientId: 'q2', kind: 'text', body, media: null });
      await flush();
      for (const { payload } of sender.sent) {
        expect(JSON.stringify(payload)).not.toContain(body.ciphertext);
        expect(payload.body).toBe('Laura Méndez: Nuevo mensaje');
      }
    });

    it('en chats individuales el título es quien escribe, y las suscripciones caducadas se borran', async () => {
      const ctx = { conversationId: 'd', conversationKind: 'direct' as const, conversationTitle: 'x', senderName: 'Andrés' };
      expect(messagePush(ctx, 'audio', false)).toMatchObject({ title: 'Andrés', body: '🎤 Nota de voz' });

      sender.gone.add(`https://push.example/${andres.id}`);
      await send.execute(laura.id, 'c1', { clientId: 'g', kind: 'text', body, media: null });
      await flush();
      expect(await subs.countForUser(andres.id)).toBe(0);
      expect(await subs.countForUser(sofia.id)).toBe(1);
    });
  });
});
