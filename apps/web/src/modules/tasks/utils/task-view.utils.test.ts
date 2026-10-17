import type { ConversationParticipant, Message, Task } from '@parla/types';
import { describe, expect, it } from 'vitest';
import { formatDue } from '@shared/utils/date';
import { taskTextKey } from '@shared/utils/ids';
import { localNotificationFor } from '../../shell/utils/notification.utils';
import { canEditTask, sortTaskViews, toTaskView } from './task-view.utils';

const task = (id: string, extra: Partial<Task> = {}): Task => ({
  id,
  conversationId: 'c1',
  title: { ciphertext: 'x', iv: 'y' },
  assigneeId: 'a',
  createdById: 'me',
  dueDate: null,
  status: 'open',
  sourceMessageId: null,
  createdAt: '2026-10-10T10:00:00Z',
  completedAt: null,
  completedById: null,
  ...extra,
});

const participants: ConversationParticipant[] = [
  { user: { id: 'me', username: null, displayName: 'Laura Méndez', about: '', avatarColor: 'teal', avatarUrl: null, presence: 'online', lastSeenAt: null, publicKey: '{}' }, role: 'admin', keyPending: false },
  { user: { id: 'a', username: null, displayName: 'Andrés Rojas', about: '', avatarColor: 'emerald', avatarUrl: null, presence: 'offline', lastSeenAt: null, publicKey: '{}' }, role: 'member', keyPending: false },
];

describe('fecha límite de las tareas', () => {
  const now = new Date('2026-10-15T09:00:00');
  it('distingue vencidas, hoy, mañana y más adelante', () => {
    expect(formatDue('2026-10-12', false, now)).toMatchObject({ tone: 'overdue' });
    expect(formatDue('2026-10-12', false, now)?.label).toMatch(/^Venció el/);
    expect(formatDue('2026-10-15', false, now)).toEqual({ label: 'Vence hoy', tone: 'today' });
    expect(formatDue('2026-10-16', false, now)).toEqual({ label: 'Mañana', tone: 'soon' });
    expect(formatDue('2026-12-01', false, now)?.tone).toBe('later');
    expect(formatDue('2026-10-12', true, now)?.tone).toBe('done');
    expect(formatDue(null, false, now)).toBeNull();
  });
});

describe('vista de tareas', () => {
  it('descifra el título, muestra "Tú" y respeta los permisos de la API', () => {
    const view = toTaskView(task('t1', { assigneeId: 'me' }), participants, { [taskTextKey('t1')]: { ok: true, text: 'Llamar al proveedor' } }, 'me', false);
    expect(view).toMatchObject({ title: 'Llamar al proveedor', assignee: { name: 'Laura Méndez', label: 'Tú' }, canToggle: true });
    expect(canEditTask(task('t2', { createdById: 'x', assigneeId: 'y' }), 'me', false)).toBe(false);
    expect(canEditTask(task('t2', { createdById: 'x', assigneeId: 'y' }), 'me', true)).toBe(true);
  });

  it('ordena: abiertas por fecha límite (sin fecha al final) y luego las hechas', () => {
    const views = [
      task('sin-fecha'),
      task('hecha', { status: 'done', dueDate: '2026-01-01' }),
      task('tarde', { dueDate: '2026-12-01' }),
      task('pronto', { dueDate: '2026-10-16' }),
    ].map((t) => toTaskView(t, participants, {}, 'me', false));
    expect(sortTaskViews(views).map((v) => v.task.id)).toEqual(['pronto', 'tarde', 'sin-fecha', 'hecha']);
  });
});

describe('aviso local con la app en segundo plano', () => {
  const conversation = {
    id: 'c1', kind: 'group' as const, title: 'Logística', description: '', avatarColor: 'teal', avatarUrl: null,
    participants, myKey: null, lastMessage: null, unreadCount: 0, mentionCount: 0, openTaskCount: 0,
    createdById: 'me', createdAt: '', updatedAt: '',
  };
  const message = (extra: Partial<Message>): Message => ({
    id: 'm1', conversationId: 'c1', senderId: 'a', kind: 'text', body: null, media: null, systemText: null,
    clientId: 'k1', status: 'sent', createdAt: '', replyTo: null, replyCount: 0, mentions: [], task: null, ...extra,
  });

  it('usa el texto ya descifrado y avisa si me mencionaron', () => {
    const notice = localNotificationFor(message({ mentions: ['me'] }), conversation, { k1: { ok: true, text: '¿Revisas esto?' } }, 'me');
    expect(notice).toEqual({ title: 'Logística', body: 'Andrés Rojas te mencionó: ¿Revisas esto?', url: '/app/c/c1', tag: 'c1' });
  });

  it('describe archivos y tareas cuando no hay texto', () => {
    expect(localNotificationFor(message({ kind: 'audio' }), conversation, {}, 'me').body).toBe('Andrés Rojas: 🎤 Nota de voz');
    const withTask = message({ kind: 'task', task: task('t9') });
    expect(localNotificationFor(withTask, conversation, { [taskTextKey('t9')]: { ok: true, text: 'Pagar arriendo' } }, 'me').body).toBe(
      'Andrés Rojas: 📋 Pagar arriendo',
    );
  });
});
