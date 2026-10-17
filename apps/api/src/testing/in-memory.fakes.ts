/** Adaptadores en memoria para probar los casos de uso sin Nest, sin base de datos y sin red. */
import type { OrderStatus, ServerToClientEvents } from '@parla/types';
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
import type { TaskRecord } from '../modules/platform/collaboration/tasks/task.record';
import type { NewTask, TaskChanges, TasksRepository } from '../modules/platform/collaboration/tasks/tasks.repository';
import type { PushResult, PushSender, PushTarget } from '../infra/push/push-sender.port';
import type { PushSubscriptionsRepository, StoredSubscription } from '../modules/platform/messaging/push/push-subscriptions.repository';
import type { PushPayload, TaskScope } from '@parla/types';
import type { NewOrder, OrderChanges, OrderRecord, OrdersRepository } from '../modules/platform/services/orders.repository';

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
    termsVersion: null,
    termsAcceptedAt: null,
    deletedAt: null,
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
  async findActiveByIds(ids: string[]) {
    return this.users.filter((u) => ids.includes(u.id) && !u.deletedAt);
  }
  async searchDirectory(excludeId: string, query: string, limit: number) {
    const q = query.trim().toLowerCase();
    return this.users
      .filter((u) => u.id !== excludeId && !u.deletedAt)
      .filter((u) => !q || u.displayName.toLowerCase().includes(q) || (u.username ?? '').includes(q.replace(/^@/, '')))
      .slice(0, limit);
  }
  /** Contactos: los fija la prueba (en la base real salen de los chats compartidos). */
  contacts = new Map<string, string[]>();
  async contactIds(userId: string) {
    return this.contacts.get(userId) ?? [];
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
  async anonymize(id: string, at: Date) {
    const user = (await this.findById(id))!;
    Object.assign(user, { username: null, phone: null, displayName: 'Cuenta eliminada', about: '', passwordHash: '', deletedAt: at });
  }
  async exportData() {
    return { conversations: [], messagesSent: 0, tasksCreated: 0, tasksAssigned: 0, ordersPlaced: 0 };
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

export class InMemoryConversationsRepository implements ConversationsRepository {
  conversations: Omit<ConversationRecord, 'lastMessage' | 'unreadCount' | 'mentionCount' | 'openTaskCount'>[] = [];
  messages: MessageRecord[] = [];
  files: { id: string; conversationId: string; uploaderId: string }[] = [];
  /** Para que las tarjetas de tarea lleven su tarea (lo conecta la prueba). */
  taskLookup?: (id: string) => TaskRecord | null;

  addConversation(id: string, users: UserRecord[], kind: 'direct' | 'group' = 'group') {
    this.conversations.push({
      id,
      kind,
      title: 'Equipo',
      description: '',
      avatarColor: 'teal',
      createdById: users[0].id,
      createdAt: new Date(),
      updatedAt: new Date(),
      participants: users.map((user, i) => ({
        user,
        role: kind === 'group' && i === 0 ? 'admin' : 'member',
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
    return c ? { ...c, lastMessage: null, unreadCount: 0, mentionCount: 0, openTaskCount: 0 } : null;
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
    const { recipientIds, replyToId = null, mentions = [], taskId = null, ...data } = input;
    const root = replyToId ? this.messages.find((m) => m.id === replyToId) : undefined;
    if (root) root.replyCount += 1;
    const message: MessageRecord = {
      ...data,
      id: nextId('m'),
      createdAt: new Date(),
      receipts: recipientIds.map((userId) => ({ userId, deliveredAt: null, readAt: null })),
      replyTo: root ? { id: root.id, senderId: root.senderId, kind: root.kind, ciphertext: root.ciphertext, iv: root.iv, clientId: root.clientId } : null,
      replyCount: 0,
      mentions,
      task: taskId ? (this.taskLookup?.(taskId) ?? null) : null,
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
  async listReplies(rootId: string) {
    return this.messages.filter((m) => m.replyTo?.id === rootId);
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

export class InMemoryTasksRepository implements TasksRepository {
  tasks: TaskRecord[] = [];
  async create(input: NewTask) {
    const task: TaskRecord = { ...input, id: nextId('t'), status: 'open', createdAt: new Date(), completedAt: null, completedById: null };
    this.tasks.push(task);
    return task;
  }
  async findById(id: string) {
    return this.tasks.find((t) => t.id === id) ?? null;
  }
  async update(id: string, changes: TaskChanges) {
    const task = this.tasks.find((t) => t.id === id)!;
    Object.assign(task, changes);
    return { ...task };
  }
  async delete(id: string) {
    this.tasks = this.tasks.filter((t) => t.id !== id);
  }
  async listForConversation(conversationId: string) {
    return this.tasks.filter((t) => t.conversationId === conversationId);
  }
  async listForUser(userId: string, scope: TaskScope) {
    return this.tasks.filter(
      (t) =>
        scope === 'assigned'
          ? t.assigneeId === userId && t.status === 'open'
          : scope === 'created'
            ? t.createdById === userId && t.status === 'open'
            : t.status === 'done' && (t.assigneeId === userId || t.createdById === userId),
    );
  }
}

export class InMemoryPushSubscriptions implements PushSubscriptionsRepository {
  items: StoredSubscription[] = [];
  async save(sub: StoredSubscription) {
    this.items = [...this.items.filter((s) => s.endpoint !== sub.endpoint), sub];
  }
  async remove(userId: string, endpoint: string) {
    this.items = this.items.filter((s) => !(s.userId === userId && s.endpoint === endpoint));
  }
  async removeByEndpoint(endpoint: string) {
    this.items = this.items.filter((s) => s.endpoint !== endpoint);
  }
  async listForUsers(userIds: string[]) {
    return this.items.filter((s) => userIds.includes(s.userId));
  }
  async countForUser(userId: string) {
    return this.items.filter((s) => s.userId === userId).length;
  }
}

export class RecordingPushSender implements PushSender {
  sent: { target: PushTarget; payload: PushPayload }[] = [];
  /** Endpoints que el servicio push da por caducados. */
  gone = new Set<string>();
  publicKey() {
    return 'clave-publica-vapid';
  }
  async send(target: PushTarget, payload: PushPayload): Promise<PushResult> {
    if (this.gone.has(target.endpoint)) return 'gone';
    this.sent.push({ target, payload });
    return 'sent';
  }
}

export class InMemoryOrdersRepository implements OrdersRepository {
  orders: OrderRecord[] = [];
  async create(order: NewOrder) {
    const record: OrderRecord = { ...order, delivery: null, createdAt: new Date(), updatedAt: new Date() };
    this.orders.push(record);
    return { ...record };
  }
  async findById(id: string) {
    const order = this.orders.find((o) => o.id === id);
    return order ? { ...order } : null;
  }
  async listForUser(userId: string, limit: number) {
    return this.orders.filter((o) => o.userId === userId).slice(0, limit);
  }
  async updateIfStatus(id: string, expected: OrderStatus, changes: OrderChanges) {
    const order = this.orders.find((o) => o.id === id);
    if (!order || order.status !== expected) return null;
    Object.assign(order, changes, { updatedAt: new Date() });
    return { ...order };
  }
}
