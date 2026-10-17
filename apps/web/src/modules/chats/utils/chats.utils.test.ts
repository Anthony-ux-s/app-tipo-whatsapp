import type { ConversationSummary, Message, PublicUser } from '@parla/types';
import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@shared/types/chat.types';
import { headerSubtitle, previewFor, typingLabel } from './conversation-preview.utils';
import { buildTimeline } from './message-timeline.utils';

const user = (id: string, displayName: string, extra: Partial<PublicUser> = {}): PublicUser => ({
  id,
  username: null,
  displayName,
  avatarUrl: null,
  about: '',
  avatarColor: 'teal',
  presence: 'offline',
  lastSeenAt: null,
  publicKey: '{}',
  ...extra,
});

const msg = (id: string, senderId: string, createdAt: string, extra: Partial<Message> = {}): ChatMessage => ({
  id,
  conversationId: 'c1',
  senderId,
  kind: 'text',
  body: { ciphertext: 'x', iv: 'y' },
  media: null,
  systemText: null,
  clientId: `client-${id}`,
  status: 'sent',
  createdAt,
  replyTo: null,
  replyCount: 0,
  mentions: [],
  ...extra,
});

const group = (lastMessage: Message | null): ConversationSummary => ({
  id: 'c1',
  kind: 'group',
  title: 'Logística',
  description: '',
  avatarColor: 'teal',
  avatarUrl: null,
  participants: [
    { user: user('me', 'Laura Méndez'), role: 'admin', keyPending: false },
    { user: user('a', 'Andrés Rojas'), role: 'member', keyPending: false },
    { user: user('s', 'Sofía Ramírez'), role: 'member', keyPending: false },
  ],
  myKey: null,
  lastMessage,
  unreadCount: 0,
  mentionCount: 0,
  createdById: 'me',
  createdAt: '2026-10-01T10:00:00',
  updatedAt: '2026-10-01T10:00:00',
});

describe('línea de tiempo del chat', () => {
  it('agrupa mensajes seguidos del mismo remitente y separa por día', () => {
    const items = buildTimeline(
      [
        msg('1', 'a', '2026-10-14T09:00:00'),
        msg('2', 'a', '2026-10-14T09:01:00'),
        msg('3', 'me', '2026-10-14T09:02:00'),
        msg('4', 'me', '2026-10-15T08:00:00'),
      ],
      new Date('2026-10-15T12:00:00'),
    );
    expect(items.map((i) => (i.type === 'day' ? i.label : `${i.message.id}:${i.firstOfRun ? 'F' : '-'}${i.lastOfRun ? 'L' : '-'}`))).toEqual([
      'Ayer',
      '1:F-',
      '2:-L',
      '3:FL',
      'Hoy',
      '4:FL',
    ]);
  });

  it('corta la racha si pasan más de 5 minutos o hay un aviso de sistema', () => {
    const items = buildTimeline([
      msg('1', 'a', '2026-10-15T09:00:00'),
      msg('2', 'a', '2026-10-15T09:10:00'),
      msg('3', 'a', '2026-10-15T09:11:00', { kind: 'system', systemText: 'x' }),
    ]).filter((i) => i.type === 'message');
    expect(items.every((i) => i.type === 'message' && i.firstOfRun)).toBe(true);
  });
});

describe('vista previa en la lista de chats', () => {
  it('muestra "Tú:" en mis mensajes y el nombre del autor en grupos', () => {
    const texts = { 'client-1': { ok: true as const, text: 'Hola equipo' } };
    expect(previewFor(group(msg('1', 'me', '2026-10-15T09:00:00')), texts, 'me')).toMatchObject({ author: 'Tú', text: 'Hola equipo' });
    expect(previewFor(group(msg('1', 'a', '2026-10-15T09:00:00')), texts, 'me')).toMatchObject({ author: 'Andrés' });
  });

  it('describe los archivos y avisa si no se pudo descifrar', () => {
    const voice = msg('2', 'a', '2026-10-15T09:00:00', { kind: 'audio', body: null });
    expect(previewFor(group(voice), {}, 'me')).toMatchObject({ text: 'Nota de voz', media: 'audio' });
    expect(previewFor(group(msg('3', 'a', '2026-10-15T09:00:00')), { 'client-3': { ok: false } }, 'me').text).toContain('No se pudo descifrar');
  });

  it('indica quién está escribiendo', () => {
    expect(typingLabel(group(null), { a: Date.now() })).toBe('Andrés está escribiendo…');
    expect(typingLabel(group(null), { a: 1, s: 1 })).toBe('Andrés, Sofía están escribiendo…');
    expect(typingLabel(group(null), {})).toBeNull();
  });

  it('el subtítulo del grupo lista a los miembros, conmigo al final', () => {
    expect(headerSubtitle(group(null), 'me')).toBe('Andrés, Sofía, Tú');
  });
});
