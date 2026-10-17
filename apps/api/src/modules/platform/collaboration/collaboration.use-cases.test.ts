import type { Message, Task } from '@parla/types';
import { beforeEach, describe, expect, it } from 'vitest';
import { assertValidDueDate, messagePush, sanitizeMentions, threadRootOf } from '../../../kernel/collaboration-rules';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../kernel/domain-error';
import { PresenceRegistry } from '../../../infra/realtime/presence.registry';
import {
  InMemoryConversationsRepository,
  InMemoryPushSubscriptions,
  InMemoryTasksRepository,
  InMemoryWorkspacesRepository,
  makeUser,
  RecordingPushSender,
  RecordingRealtime,
} from '../../../testing/in-memory.fakes';
import { GetConversationUseCase } from '../messaging/conversations/use-cases/get-conversation.use-case';
import { GetThreadUseCase } from '../messaging/conversations/use-cases/get-thread.use-case';
import { SendMessageUseCase } from '../messaging/conversations/use-cases/send-message.use-case';
import { NotificationDispatcher } from '../messaging/push/use-cases/notification-dispatcher';
import { CreateTaskUseCase } from './tasks/use-cases/create-task.use-case';
import { ListMyTasksUseCase } from './tasks/use-cases/list-tasks.use-case';
import { UpdateTaskUseCase } from './tasks/use-cases/update-task.use-case';

const body = { ciphertext: 'Y2lmcmFkbw==', iv: 'aXY=' };
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Fase 3: hilos, menciones, tareas y notificaciones push', () => {
  const laura = makeUser({ displayName: 'Laura Méndez' });
  const andres = makeUser({ displayName: 'Andrés Rojas' });
  const sofia = makeUser({ displayName: 'Sofía Ramírez' });
  const externo = makeUser({ displayName: 'Externo' });

  let repo: InMemoryConversationsRepository;
  let tasksRepo: InMemoryTasksRepository;
  let workspaces: InMemoryWorkspacesRepository;
  let realtime: RecordingRealtime;
  let presence: PresenceRegistry;
  let subs: InMemoryPushSubscriptions;
  let sender: RecordingPushSender;
  let send: SendMessageUseCase;
  let thread: GetThreadUseCase;
  let createTask: CreateTaskUseCase;
  let updateTask: UpdateTaskUseCase;
  let myTasks: ListMyTasksUseCase;

  beforeEach(async () => {
    repo = new InMemoryConversationsRepository();
    repo.addConversation('c1', [laura, andres, sofia]);
    repo.addConversation('otro', [laura, externo]);
    tasksRepo = new InMemoryTasksRepository();
    repo.taskLookup = (id) => tasksRepo.tasks.find((t) => t.id === id) ?? null;
    workspaces = new InMemoryWorkspacesRepository();
    workspaces.add(laura, 'w1', 'admin');
    workspaces.add(andres, 'w1', 'member');
    workspaces.add(sofia, 'w1', 'member');
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
    createTask = new CreateTaskUseCase(tasksRepo, repo, realtime, get, send, dispatcher);
    updateTask = new UpdateTaskUseCase(tasksRepo, workspaces, realtime, get, dispatcher);
    myTasks = new ListMyTasksUseCase(tasksRepo, workspaces);
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
        url: '/app/w/w1/c/c1',
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
      const ctx = { conversationId: 'd', workspaceId: 'w', conversationKind: 'direct' as const, conversationTitle: 'x', senderName: 'Andrés' };
      expect(messagePush(ctx, 'audio', false)).toMatchObject({ title: 'Andrés', body: '🎤 Nota de voz' });

      sender.gone.add(`https://push.example/${andres.id}`);
      await send.execute(laura.id, 'c1', { clientId: 'g', kind: 'text', body, media: null });
      await flush();
      expect(await subs.countForUser(andres.id)).toBe(0);
      expect(await subs.countForUser(sofia.id)).toBe(1);
    });
  });

  describe('tareas asignables', () => {
    const newTask = (extra: Partial<Parameters<CreateTaskUseCase['execute']>[2]> = {}) => ({
      clientId: `t-${Math.random()}`,
      title: body,
      assigneeId: andres.id,
      dueDate: '2026-12-15',
      sourceMessageId: null,
      ...extra,
    });

    it('crear una tarea publica su tarjeta en el chat, avisa a todos y notifica a la persona asignada', async () => {
      const task = await createTask.execute(laura.id, 'c1', newTask());
      await flush();
      expect(task).toMatchObject({ status: 'open', assigneeId: andres.id, createdById: laura.id, dueDate: '2026-12-15' });

      const card = realtime.events('message:new').at(-1)!.payload as Message;
      expect(card).toMatchObject({ kind: 'task', mentions: [andres.id], body: null });
      expect(card.task?.id).toBe(task.id);
      expect((realtime.events('task:upsert')[0].payload as Task).id).toBe(task.id);
      expect(sender.sent.map((s) => s.payload.body)).toEqual(['Laura Méndez te asignó una tarea']);
    });

    it('valida a quién se asigna, la fecha y el mensaje de origen', async () => {
      await expect(createTask.execute(laura.id, 'c1', newTask({ assigneeId: externo.id }))).rejects.toThrow(ValidationError);
      await expect(createTask.execute(laura.id, 'c1', newTask({ dueDate: '2026-02-30' }))).rejects.toThrow('La fecha límite no es válida');
      await expect(createTask.execute(laura.id, 'c1', newTask({ sourceMessageId: 'no-existe' }))).rejects.toThrow(ValidationError);
      await expect(createTask.execute(externo.id, 'c1', newTask())).rejects.toThrow(NotFoundError);
      expect(tasksRepo.tasks).toHaveLength(0);
    });

    it('la persona asignada la completa y la reabre; se guarda quién y cuándo', async () => {
      const task = await createTask.execute(laura.id, 'c1', newTask());
      const done = await updateTask.execute(andres.id, 'c1', task.id, { status: 'done' });
      expect(done.status).toBe('done');
      expect(done.completedById).toBe(andres.id);
      expect(done.completedAt).not.toBeNull();

      const reopened = await updateTask.execute(andres.id, 'c1', task.id, { status: 'open' });
      expect(reopened).toMatchObject({ status: 'open', completedAt: null, completedById: null });
    });

    it('otra persona del chat no puede cambiarla, pero un administrador sí', async () => {
      const task = await createTask.execute(andres.id, 'c1', newTask({ assigneeId: andres.id }));
      await expect(updateTask.execute(sofia.id, 'c1', task.id, { status: 'done' })).rejects.toThrow(ForbiddenError);
      await expect(updateTask.execute(laura.id, 'c1', task.id, { assigneeId: sofia.id })).resolves.toMatchObject({ assigneeId: sofia.id });
    });

    it('"Mis tareas" separa asignadas, creadas y hechas', async () => {
      const a = await createTask.execute(laura.id, 'c1', newTask({ assigneeId: andres.id }));
      await createTask.execute(andres.id, 'c1', newTask({ assigneeId: sofia.id }));
      await updateTask.execute(andres.id, 'c1', a.id, { status: 'done' });

      expect(await myTasks.execute(andres.id, 'w1', 'assigned')).toHaveLength(0);
      expect(await myTasks.execute(andres.id, 'w1', 'created')).toHaveLength(1);
      expect((await myTasks.execute(andres.id, 'w1', 'done')).map((t) => t.id)).toEqual([a.id]);
      await expect(myTasks.execute(externo.id, 'w1', 'assigned')).rejects.toThrow(NotFoundError);
    });

    it('fechas límite válidas', () => {
      expect(() => assertValidDueDate('2026-12-31')).not.toThrow();
      expect(() => assertValidDueDate(null)).not.toThrow();
      expect(() => assertValidDueDate('31/12/2026')).toThrow(ValidationError);
    });
  });
});
