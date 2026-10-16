/** Adaptadores en memoria para probar los casos de uso sin Nest, sin base de datos y sin red. */
import type { ServerToClientEvents, WorkspaceRole } from '@parla/types';
import type { PasswordHasher } from '../infra/identity/password-hasher.port';
import type { TokenService } from '../infra/identity/token-service.port';
import type { RealtimePublisher } from '../infra/realtime/realtime-publisher.port';
import type { AuthRepository, NewUser, ProfileChanges } from '../modules/platform/identity/auth/auth.repository';
import type { UserRecord } from '../modules/platform/identity/user.record';
import type {
  ConversationRecord,
  ConversationsRepository,
  MessageRecord,
  NewMessage,
  ReceiptChange,
} from '../modules/platform/messaging/conversations/conversations.repository';
import type { MembershipRecord, WorkspaceRecord, WorkspacesRepository } from '../modules/platform/workspaces/workspaces.repository';

let seq = 0;
const nextId = (prefix: string) => `${prefix}${++seq}`;

export function makeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: nextId('u'),
    username: null,
    phone: null,
    displayName: 'Persona',
    about: '',
    avatarColor: 'teal',
    passwordHash: 'hash:Parla2026!',
    publicKey: '{"kty":"EC"}',
    keyBackup: { ciphertext: 'x', iv: 'y', salt: 'z', iterations: 1000 },
    preferences: { theme: 'system', enterToSend: true, notificationSound: true },
    lastSeenAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

export class InMemoryAuthRepository implements AuthRepository {
  users: UserRecord[] = [];
  async findById(id: string) {
    return this.users.find((u) => u.id === id) ?? null;
  }
  async findByPhone(phone: string) {
    return this.users.find((u) => u.phone === phone) ?? null;
  }
  async findByUsername(username: string) {
    return this.users.find((u) => u.username === username) ?? null;
  }
  async create(input: NewUser) {
    const user = makeUser({ ...input });
    this.users.push(user);
    return user;
  }
  async update(id: string, changes: ProfileChanges) {
    const user = (await this.findById(id))!;
    Object.assign(user, Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined)));
    return user;
  }
  async touchLastSeen(id: string, at: Date) {
    const user = await this.findById(id);
    if (user) user.lastSeenAt = at;
  }
}

export const fakeHasher: PasswordHasher = {
  hash: async (plain) => `hash:${plain}`,
  verify: async (plain, hash) => hash === `hash:${plain}`,
};

export const fakeTokens: TokenService = {
  issue: async (userId) => `token-${userId}`,
  verify: async (token) => (token.startsWith('token-') ? token.slice(6) : null),
};

type Emitted = { userIds: readonly string[]; event: keyof ServerToClientEvents; payload: unknown };

export class RecordingRealtime implements RealtimePublisher {
  emitted: Emitted[] = [];
  toUsers<E extends keyof ServerToClientEvents>(userIds: readonly string[], event: E, ...payload: Parameters<ServerToClientEvents[E]>) {
    this.emitted.push({ userIds, event, payload: payload[0] });
  }
  events(event: keyof ServerToClientEvents) {
    return this.emitted.filter((e) => e.event === event);
  }
}

export class InMemoryWorkspacesRepository implements WorkspacesRepository {
  workspaces: WorkspaceRecord[] = [];
  members: { workspaceId: string; user: UserRecord; role: WorkspaceRole }[] = [];

  add(user: UserRecord, workspaceId: string, role: WorkspaceRole) {
    this.members.push({ workspaceId, user, role });
  }
  async listForUser(userId: string) {
    return this.members
      .filter((m) => m.user.id === userId)
      .map((m) => ({ ...this.workspaces.find((w) => w.id === m.workspaceId)!, role: m.role }));
  }
  async findById(id: string) {
    const ws = this.workspaces.find((w) => w.id === id);
    return ws ? { ...ws, memberCount: this.members.filter((m) => m.workspaceId === id).length } : null;
  }
  async findByInviteCode(code: string) {
    return this.workspaces.find((w) => w.inviteCode === code) ?? null;
  }
  async roleOf(workspaceId: string, userId: string) {
    return this.members.find((m) => m.workspaceId === workspaceId && m.user.id === userId)?.role ?? null;
  }
  async listMembers(workspaceId: string): Promise<MembershipRecord[]> {
    return this.members
      .filter((m) => m.workspaceId === workspaceId)
      .map((m) => ({ memberId: `${m.workspaceId}-${m.user.id}`, role: m.role, joinedAt: new Date(), user: m.user }));
  }
  async countAdmins(workspaceId: string) {
    return this.members.filter((m) => m.workspaceId === workspaceId && m.role === 'admin').length;
  }
  async create(): Promise<WorkspaceRecord> {
    throw new Error('no usado en estas pruebas');
  }
  async update(id: string) {
    return (await this.findById(id))!;
  }
  async addMember(workspaceId: string, userId: string, role: WorkspaceRole) {
    this.members.push({ workspaceId, user: makeUser({ id: userId }), role });
  }
  async changeRole(workspaceId: string, userId: string, role: WorkspaceRole) {
    this.members.find((m) => m.workspaceId === workspaceId && m.user.id === userId)!.role = role;
  }
  async removeMember(workspaceId: string, userId: string) {
    this.members = this.members.filter((m) => !(m.workspaceId === workspaceId && m.user.id === userId));
  }
  async listContactIds() {
    return [];
  }
}

export class InMemoryConversationsRepository implements ConversationsRepository {
  conversations: Omit<ConversationRecord, 'lastMessage' | 'unreadCount'>[] = [];
  messages: MessageRecord[] = [];
  files: { id: string; conversationId: string; uploaderId: string }[] = [];

  addConversation(id: string, users: UserRecord[], kind: 'direct' | 'group' = 'group') {
    this.conversations.push({
      id,
      workspaceId: 'w1',
      kind,
      title: 'Equipo',
      description: '',
      avatarColor: 'teal',
      createdById: users[0].id,
      createdAt: new Date(),
      updatedAt: new Date(),
      participants: users.map((user) => ({
        user,
        role: 'member',
        wrappedKey: 'k',
        keyIv: 'i',
        wrappedById: users[0].id,
        wrapperPublicKey: users[0].publicKey,
      })),
    });
  }

  async listForUser() {
    return [];
  }
  async findForUser(conversationId: string, userId: string) {
    const c = this.conversations.find((x) => x.id === conversationId && x.participants.some((p) => p.user.id === userId));
    return c ? { ...c, lastMessage: null, unreadCount: 0 } : null;
  }
  async findIdByDirectKey() {
    return null;
  }
  async participantIds(conversationId: string) {
    return this.conversations.find((c) => c.id === conversationId)?.participants.map((p) => p.user.id) ?? [];
  }
  async create(): Promise<string> {
    throw new Error('no usado en estas pruebas');
  }
  async addParticipants() {}
  async removeParticipant() {}
  async createMessage(input: NewMessage) {
    const existing = this.messages.find((m) => m.senderId === input.senderId && m.clientId === input.clientId);
    if (existing) return existing;
    const { recipientIds, ...data } = input;
    const message: MessageRecord = {
      ...data,
      id: nextId('m'),
      createdAt: new Date(),
      receipts: recipientIds.map((userId) => ({ userId, deliveredAt: null, readAt: null })),
    };
    this.messages.push(message);
    return message;
  }
  async listMessages(conversationId: string) {
    return this.messages.filter((m) => m.conversationId === conversationId);
  }
  async findMessages(ids: string[]) {
    return this.messages.filter((m) => ids.includes(m.id));
  }
  async markDelivered(userId: string, scope: { conversationId: string; messageIds: string[] } | 'all') {
    return this.touch(userId, (m) => scope === 'all' || (m.conversationId === scope.conversationId && scope.messageIds.includes(m.id)), 'delivered');
  }
  async markRead(userId: string, conversationId: string) {
    return this.touch(userId, (m) => m.conversationId === conversationId, 'read');
  }
  private touch(userId: string, match: (m: MessageRecord) => boolean, kind: 'delivered' | 'read'): ReceiptChange[] {
    const changes: ReceiptChange[] = [];
    for (const m of this.messages.filter(match)) {
      const r = m.receipts.find((x) => x.userId === userId);
      if (!r || (kind === 'read' ? r.readAt : r.deliveredAt)) continue;
      const now = new Date();
      if (kind === 'read') r.readAt = now;
      r.deliveredAt ??= now;
      changes.push({ messageId: m.id, conversationId: m.conversationId, senderId: m.senderId });
    }
    return changes;
  }
  async registerFile(input: { id: string; conversationId: string; uploaderId: string; size: number }) {
    this.files.push(input);
  }
  async findFile(fileId: string) {
    return this.files.find((f) => f.id === fileId) ?? null;
  }
}
