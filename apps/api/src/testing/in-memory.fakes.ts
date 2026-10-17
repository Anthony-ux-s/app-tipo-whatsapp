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
import type { PushResult, PushSender, PushTarget } from '../infra/push/push-sender.port';
import type { PushSubscriptionsRepository, StoredSubscription } from '../modules/platform/messaging/push/push-subscriptions.repository';
import type { PushPayload } from '@parla/types';
import type { UpdateBusinessRequest } from '@parla/types';
import type { BusinessesRepository, BusinessRecord } from '../modules/platform/services/businesses.repository';
import type { DriverProfileRequest, GeoPoint, OrderRating } from '@parla/types';
import type { DriverRecord, DriversRepository } from '../modules/platform/services/drivers.repository';
import type { NewOrder, OrderChanges, OrderRecord, OrdersRepository } from '../modules/platform/services/orders.repository';
import type { AppEnv } from '../config/env.validation';
import type { VerificationSender } from '../infra/messaging/verification-sender.port';
import type { NewVerification, VerificationCodesRepository, VerificationRecord } from '../modules/platform/identity/verification/verification-codes.repository';
import type { VerificationPurpose } from '../kernel/verification-rules';
import type { WrappedKey } from '@parla/types';

let seq = 0;
const nextId = (prefix: string) => `${prefix}${++seq}`;

export function makeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: nextId('u'),
    username: null,
    phone: null,
    phoneVerifiedAt: null,
    email: null,
    emailVerifiedAt: null,
    avatarFileId: null,
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
  async findByVerifiedEmail(email: string) {
    return this.users.find((u) => u.email === email && u.emailVerifiedAt && !u.deletedAt) ?? null;
  }
  async findActiveByPhones(phones: string[]) {
    return this.users.filter((u) => u.phone && phones.includes(u.phone) && !u.deletedAt);
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
    return { ...user };
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
    return { conversations: [], messagesSent: 0, ordersPlaced: 0 };
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
  conversations: Omit<ConversationRecord, 'lastMessage' | 'unreadCount' | 'mentionCount'>[] = [];
  messages: MessageRecord[] = [];
  files: { id: string; conversationId: string; uploaderId: string }[] = [];
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
    return c ? { ...c, lastMessage: null, unreadCount: 0, mentionCount: 0 } : null;
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
  async markKeysPending(userId: string) {
    const ids: string[] = [];
    for (const c of this.conversations) {
      const p = c.participants.find((x) => x.user.id === userId);
      if (p) {
        p.wrappedKey = '';
        ids.push(c.id);
      }
    }
    return ids;
  }
  async reshareKeys(conversationId: string, keys: WrappedKey[]) {
    const c = this.conversations.find((x) => x.id === conversationId)!;
    for (const k of keys) {
      const p = c.participants.find((x) => x.user.id === k.userId && x.wrappedKey === '');
      if (p) Object.assign(p, { wrappedKey: k.wrappedKey, keyIv: k.iv, wrappedById: k.wrappedById });
    }
  }
  async createMessage(input: NewMessage) {
    const existing = this.messages.find((m) => m.senderId === input.senderId && m.clientId === input.clientId);
    if (existing) return existing;
    const { recipientIds, replyToId = null, mentions = [], ...data } = input;
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

export class InMemoryBusinessesRepository implements BusinessesRepository {
  businesses: BusinessRecord[] = [];
  async findByService(service: string) {
    return this.businesses.find((b) => b.service === service) ?? null;
  }
  async findByOwner(ownerId: string) {
    return this.businesses.find((b) => b.ownerId === ownerId) ?? null;
  }
  async update(id: string, changes: UpdateBusinessRequest) {
    const business = this.businesses.find((b) => b.id === id)!;
    Object.assign(business, changes);
    return { ...business };
  }
}

export class InMemoryDriversRepository implements DriversRepository {
  drivers: DriverRecord[] = [];
  async findByUser(userId: string) {
    const d = this.drivers.find((x) => x.userId === userId);
    return d ? structuredClone(d) : null;
  }
  async listUserIds() {
    return this.drivers.filter((d) => d.active && d.online).map((d) => d.userId);
  }
  async register(userId: string, profile: Required<DriverProfileRequest>) {
    const existing = this.drivers.find((d) => d.userId === userId);
    if (existing) Object.assign(existing, profile, { active: true, online: false });
    else this.drivers.push({ userId, ...profile, active: true, online: false, location: null });
    return (await this.findByUser(userId))!;
  }
  async update(userId: string, changes: Partial<Pick<DriverRecord, 'vehicle' | 'plate' | 'online' | 'active'>>) {
    Object.assign(this.drivers.find((d) => d.userId === userId)!, changes);
    return (await this.findByUser(userId))!;
  }
  async saveLocation(userId: string, point: GeoPoint, at: Date) {
    this.drivers.find((d) => d.userId === userId)!.location = { ...point, at };
  }
}

export class InMemoryOrdersRepository implements OrdersRepository {
  orders: OrderRecord[] = [];
  constructor(
    private readonly businesses = new InMemoryBusinessesRepository(),
    private readonly drivers?: InMemoryDriversRepository,
  ) {}
  async create({ businessId, ...order }: NewOrder) {
    const found = this.businesses.businesses.find((b) => b.id === businessId);
    const business = found ? { id: found.id, name: found.name, ownerId: found.ownerId, address: found.address, location: null } : null;
    const now = new Date();
    const record: OrderRecord = {
      ...order,
      business,
      delivery: null,
      driverId: null,
      driverLocation: null,
      deliveryCodeAttempts: 0,
      rating: null,
      timeline: [{ status: order.status, at: now.toISOString() }],
      createdAt: now,
      updatedAt: now,
    };
    this.orders.push(record);
    return structuredClone(record);
  }
  async findById(id: string) {
    const order = this.orders.find((o) => o.id === id);
    return order ? this.withLocation(order) : null;
  }
  async listForUser(userId: string, limit: number) {
    return this.orders.filter((o) => o.userId === userId).slice(0, limit).map((o) => structuredClone(o));
  }
  async listForBusiness(businessId: string, limit: number) {
    const hidden: OrderStatus[] = ['pending_payment', 'payment_expired'];
    return this.orders.filter((o) => o.business?.id === businessId && !hidden.includes(o.status)).slice(0, limit).map((o) => structuredClone(o));
  }
  async listAvailableForDrivers(limit: number) {
    return this.orders.filter((o) => o.status === 'searching_driver' && !o.driverId).slice(0, limit).map((o) => structuredClone(o));
  }
  async listForDriver(driverId: string, limit: number) {
    return this.orders.filter((o) => o.driverId === driverId).slice(0, limit).map((o) => structuredClone(o));
  }
  async countActiveForDriver(driverId: string) {
    return (await this.listActiveForDriver(driverId)).length;
  }
  async listActiveForDriver(driverId: string) {
    return this.orders.filter((o) => o.driverId === driverId && (o.status === 'driver_assigned' || o.status === 'on_the_way')).map((o) => this.withLocation(o));
  }
  async driverEarnings(driverId: string, since: { today: Date; week: Date }) {
    const done = this.orders.filter((o) => o.driverId === driverId && o.status === 'delivered');
    const sum = (from?: Date): [number, number] => {
      const list = done.filter((o) => !from || o.updatedAt >= from);
      return [list.reduce((s, o) => s + o.deliveryFeeCents + o.tipCents, 0), list.length];
    };
    return { today: sum(since.today), week: sum(since.week), total: sum(), tipsCents: done.reduce((s, o) => s + o.tipCents, 0) };
  }
  async listByStatus(statuses: OrderStatus[], limit: number) {
    return this.orders.filter((o) => statuses.includes(o.status)).slice(0, limit).map((o) => this.withLocation(o));
  }
  async rate(id: string, rating: Omit<OrderRating, 'at'>, at: Date) {
    const order = this.orders.find((o) => o.id === id);
    if (!order || order.rating) return null;
    order.rating = { ...rating, at: at.toISOString() };
    return this.withLocation(order);
  }
  async ratingSummary(of: { driverId: string } | { businessId: string }) {
    const stars = this.orders
      .filter((o) => ('driverId' in of ? o.driverId === of.driverId : o.business?.id === of.businessId))
      .map((o) => ('driverId' in of ? o.rating?.driverStars : o.rating?.storeStars))
      .filter((n): n is number => typeof n === 'number');
    return { average: stars.length ? Math.round((stars.reduce((a, b) => a + b, 0) / stars.length) * 10) / 10 : null, count: stars.length };
  }
  /** Como el include de Prisma: la última ubicación del repartidor viene con el pedido. */
  private withLocation(o: OrderRecord): OrderRecord {
    const copy = structuredClone(o);
    copy.driverLocation = (o.driverId && this.drivers?.drivers.find((d) => d.userId === o.driverId)?.location) || null;
    return copy;
  }
  async updateIfStatus(id: string, expected: OrderStatus, { note, ...changes }: OrderChanges) {
    const order = this.orders.find((o) => o.id === id);
    if (!order || order.status !== expected) return null;
    if (changes.status !== expected || note) order.timeline.push({ status: changes.status, at: new Date().toISOString(), ...(note ? { note } : {}) });
    Object.assign(order, changes, { updatedAt: new Date() });
    return structuredClone(order);
  }
  async resetDeliveryCode(id: string, code: string) {
    const order = this.orders.find((o) => o.id === id)!;
    Object.assign(order, { deliveryCode: code, deliveryCodeAttempts: 0, updatedAt: new Date() });
    return structuredClone(order);
  }
  async addFailedCodeAttempt(id: string) {
    const order = this.orders.find((o) => o.id === id)!;
    order.deliveryCodeAttempts += 1;
    return order.deliveryCodeAttempts;
  }
}

/** Entorno mínimo para los casos de uso que lo leen (verificación por código). */
export const testEnv = {
  production: false,
  jwtSecret: 'secreto-de-prueba',
  publicWebUrl: 'http://localhost:3100',
} as AppEnv;

export class InMemoryVerificationCodes implements VerificationCodesRepository {
  rows: VerificationRecord[] = [];
  async create(input: NewVerification) {
    const row: VerificationRecord = { ...input, id: nextId('v'), attempts: 0, verifiedAt: null, proofHash: null, consumedAt: null, createdAt: new Date() };
    this.rows.push(row);
    return row;
  }
  async listRecent(target: string, purpose: VerificationPurpose, since: Date) {
    return this.rows.filter((r) => r.target === target && r.purpose === purpose && r.createdAt >= since);
  }
  async findLatestPending(query: { purpose: VerificationPurpose; target?: string; userId?: string }) {
    return (
      [...this.rows]
        .reverse()
        .find((r) => r.purpose === query.purpose && !r.verifiedAt && (!query.target || r.target === query.target) && (!query.userId || r.userId === query.userId)) ?? null
    );
  }
  async countAttempt(id: string) {
    this.rows.find((r) => r.id === id)!.attempts += 1;
  }
  async markVerified(id: string, proofHash: string, at: Date) {
    Object.assign(this.rows.find((r) => r.id === id)!, { verifiedAt: at, proofHash });
  }
  async findByProof(proofHash: string) {
    return this.rows.find((r) => r.proofHash === proofHash) ?? null;
  }
  async consume(id: string, at: Date) {
    const row = this.rows.find((r) => r.id === id)!;
    if (row.consumedAt) return false;
    row.consumedAt = at;
    return true;
  }
  /** Para simular el paso del tiempo en las pruebas. */
  age(ms: number) {
    for (const r of this.rows) {
      r.createdAt = new Date(r.createdAt.getTime() - ms);
      r.expiresAt = new Date(r.expiresAt.getTime() - ms);
      if (r.verifiedAt) r.verifiedAt = new Date(r.verifiedAt.getTime() - ms);
    }
  }
}

/** Guarda lo que se habría enviado por SMS y correo (para leer el código en la prueba). */
export class RecordingVerificationSender implements VerificationSender {
  constructor(readonly provider: 'onesignal' | 'dev' = 'onesignal') {}
  sms: { phone: string; text: string }[] = [];
  emails: { to: string; subject: string; html: string }[] = [];
  async sendSms(phone: string, text: string) {
    this.sms.push({ phone, text });
  }
  async sendEmail(to: string, subject: string, html: string) {
    this.emails.push({ to, subject, html });
  }
  lastSmsCode() {
    return this.sms.at(-1)!.text.match(/(\d{6})/)![1];
  }
  lastEmailCode() {
    return this.emails.at(-1)!.subject.match(/(\d{6})/)![1];
  }
}
