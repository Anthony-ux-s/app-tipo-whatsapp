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
import type { CatalogSource, StoreProduct, StoreStatus, UpdateBusinessRequest } from '@parla/types';
import { bigOrderRulesOf } from '../kernel/big-order';
import type { StoreLedgerEntryRecord, StoreLedgerRepository } from '../modules/platform/services/store-ledger.repository';
import { NO_API, type ConnectorLink, type BusinessesRepository, type BusinessRecord, type NewBusiness, type StoreApiConfig, type StoreFilter } from '../modules/platform/services/businesses.repository';
import type { ProductsRepository, ReservationLine, ReserveOutcome } from '../modules/platform/stores/products.repository';
import type { ClaimStatus, GeoPoint, OrderRating } from '@parla/types';
import type { ClaimChanges, ClaimRecord, ClaimsRepository, NewClaim } from '../modules/platform/services/claims.repository';
import type { DriverLedgerRepository, LedgerEntryRecord } from '../modules/platform/services/driver-ledger.repository';
import type { PhotosRepository } from '../modules/platform/services/photos.repository';
import type { DriverChanges, DriverRecord, DriverRegistration, DriversRepository } from '../modules/platform/services/drivers.repository';
import type { AdminOrderFilter, NewOrder, OfferReservation, OrderChanges, OrderRecord, OrdersRepository } from '../modules/platform/services/orders.repository';
import type { CouponRecord, CouponsRepository, NewCoupon } from '../modules/platform/services/coupons.repository';
import type { AddressesRepository } from '../modules/platform/services/addresses.repository';
import type { DeliveryAddress as AddressInput, SavedAddress } from '@parla/types';
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
    preferences: { theme: 'system', enterToSend: true, notificationSound: true, chatEffects: true },
    lastSeenAt: null,
    createdAt: new Date(),
    termsVersion: null,
    termsAcceptedAt: null,
    isAdmin: false,
    blockedAt: null,
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
  async listAdminIds() {
    return this.users.filter((u) => u.isAdmin && !u.deletedAt).map((u) => u.id);
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
    const { recipientIds, deliveredTo = [], replyToId = null, mentions = [], ...data } = input;
    const root = replyToId ? this.messages.find((m) => m.id === replyToId) : undefined;
    if (root) root.replyCount += 1;
    const message: MessageRecord = {
      ...data,
      id: nextId('m'),
      createdAt: new Date(),
      receipts: recipientIds.map((userId) => ({ userId, deliveredAt: deliveredTo.includes(userId) ? new Date() : null, readAt: null })),
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

/** Una tienda de prueba aprobada y abierta; `over` cambia lo que haga falta. */
export function makeBusiness(over: Partial<BusinessRecord> = {}): BusinessRecord {
  return {
    id: 'biz_1',
    name: 'Bodega MercaYa',
    service: 'mercado',
    description: '',
    ownerId: 'owner_1',
    address: 'Av. Benavides 1180',
    phone: '',
    location: null,
    status: 'approved',
    reviewNote: '',
    source: 'native',
    acceptingOrders: true,
    opensAt: '08:00',
    closesAt: '22:00',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    api: NO_API,
    connector: null,
    bigOrderCents: null,
    bigOrderUnits: null,
    adminWhatsapp: '',
    payoutPhone: '',
    ...over,
  };
}

export class InMemoryBusinessesRepository implements BusinessesRepository {
  businesses: BusinessRecord[] = [];
  private seq = 0;
  async findById(id: string) {
    const b = this.businesses.find((x) => x.id === id);
    return b ? { ...b } : null;
  }
  async findByOwner(ownerId: string) {
    return this.businesses.find((b) => b.ownerId === ownerId) ?? null;
  }
  async create(input: NewBusiness) {
    const record = makeBusiness({ id: `biz_new_${++this.seq}`, ...input, status: 'pending', source: 'native', createdAt: new Date() });
    this.businesses.push(record);
    return { ...record };
  }
  async update(id: string, changes: UpdateBusinessRequest) {
    const business = this.businesses.find((b) => b.id === id)!;
    Object.assign(business, changes);
    return { ...business };
  }
  async setReview(id: string, review: { status: StoreStatus; reviewNote: string; reviewedById: string }) {
    const business = this.businesses.find((b) => b.id === id)!;
    business.status = review.status;
    business.reviewNote = review.reviewNote;
    return { ...business };
  }
  async setSource(id: string, source: CatalogSource, api: StoreApiConfig) {
    const business = this.businesses.find((b) => b.id === id)!;
    business.source = source;
    business.api = api;
    return { ...business };
  }
  async setConnector(id: string, link: ConnectorLink | null) {
    const business = this.businesses.find((b) => b.id === id)!;
    business.connector = link;
    return { ...business };
  }
  async setBigOrderRules(id: string, rules: { totalCents: number | null; units: number | null; whatsapp: string }) {
    const business = this.businesses.find((b) => b.id === id)!;
    Object.assign(business, { bigOrderCents: rules.totalCents, bigOrderUnits: rules.units, adminWhatsapp: rules.whatsapp });
    return { ...business };
  }
  async setPayoutPhone(id: string, phone: string) {
    this.businesses.find((b) => b.id === id)!.payoutPhone = phone;
  }
  async remove(id: string) {
    this.businesses = this.businesses.filter((b) => b.id !== id);
  }
  async list(filter: StoreFilter) {
    return this.businesses.filter((b) => (!filter.service || b.service === filter.service) && (!filter.status || b.status === filter.status)).map((b) => ({ ...b }));
  }
  async countApprovedByService() {
    const counts: Record<string, number> = {};
    for (const b of this.businesses) if (b.status === 'approved') counts[b.service] = (counts[b.service] ?? 0) + 1;
    return counts;
  }
}

/** Catálogo propio de las tiendas en memoria (con reservas de stock todo-o-nada e idempotentes). */
export class InMemoryProductsRepository implements ProductsRepository {
  rows = new Map<string, StoreProduct>();
  reservations = new Map<string, { lines: ReservationLine[]; released: boolean }>();
  private key = (businessId: string, sku: string) => `${businessId}::${sku}`;
  async list(businessId: string, opts: { query?: string; category?: string; onlyActive: boolean; limit: number }) {
    const q = opts.query?.trim().toLowerCase();
    return [...this.rows.entries()]
      .filter(([k]) => k.startsWith(`${businessId}::`))
      .map(([, p]) => ({ ...p }))
      .filter((p) => (!opts.onlyActive || p.active) && (!opts.category || p.category === opts.category) && (!q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)))
      .slice(0, opts.limit);
  }
  async find(businessId: string, sku: string) {
    const p = this.rows.get(this.key(businessId, sku));
    return p ? { ...p } : null;
  }
  async create(businessId: string, product: StoreProduct) {
    if (this.rows.has(this.key(businessId, product.sku))) return false;
    this.rows.set(this.key(businessId, product.sku), { ...product });
    return true;
  }
  async update(businessId: string, sku: string, product: StoreProduct) {
    if (!this.rows.has(this.key(businessId, sku))) return null;
    this.rows.set(this.key(businessId, sku), { ...product, sku });
    return { ...product, sku };
  }
  async delete(businessId: string, sku: string) {
    return this.rows.delete(this.key(businessId, sku));
  }
  async count(businessId: string) {
    return [...this.rows.keys()].filter((k) => k.startsWith(`${businessId}::`)).length;
  }
  async upsertMany(businessId: string, products: StoreProduct[]) {
    let created = 0;
    let updated = 0;
    for (const p of products) {
      if (this.rows.has(this.key(businessId, p.sku))) updated += 1;
      else created += 1;
      this.rows.set(this.key(businessId, p.sku), { ...p });
    }
    return { created, updated };
  }
  async patch(businessId: string, sku: string, changes: { priceCents?: number; listPriceCents?: number | null; stock?: number }) {
    const p = this.rows.get(this.key(businessId, sku));
    if (!p) return null;
    Object.assign(p, changes);
    return { ...p };
  }
  async reserve(businessId: string, reference: string, lines: ReservationLine[]): Promise<ReserveOutcome> {
    const rKey = `${businessId}::${reference}`;
    const existing = this.reservations.get(rKey);
    if (existing && !existing.released) return { ok: true };
    for (const l of lines) {
      const p = this.rows.get(this.key(businessId, l.sku));
      if (!p || !p.active) return { ok: false, reason: 'UNKNOWN_PRODUCT', sku: l.sku };
      if (p.stock < l.quantity) return { ok: false, reason: 'OUT_OF_STOCK', sku: l.sku };
    }
    for (const l of lines) this.rows.get(this.key(businessId, l.sku))!.stock -= l.quantity;
    this.reservations.set(rKey, { lines, released: false });
    return { ok: true };
  }
  async release(businessId: string, reference: string) {
    const r = this.reservations.get(`${businessId}::${reference}`);
    if (!r || r.released) return false;
    for (const l of r.lines) {
      const p = this.rows.get(this.key(businessId, l.sku));
      if (p) p.stock += l.quantity;
    }
    r.released = true;
    return true;
  }
}

export class InMemoryDriversRepository implements DriversRepository {
  drivers: DriverRecord[] = [];
  async findByUser(userId: string) {
    const d = this.drivers.find((x) => x.userId === userId);
    return d ? structuredClone(d) : null;
  }
  async listOnline() {
    return this.drivers.filter((d) => d.active && d.online && d.status === 'approved').map((d) => structuredClone(d));
  }
  async register(userId: string, r: DriverRegistration) {
    const existing = this.drivers.find((d) => d.userId === userId);
    const status = existing?.status === 'approved' ? 'approved' : 'pending';
    if (existing) Object.assign(existing, r, { active: true, online: false, status, reviewNote: null });
    else
      this.drivers.push({
        userId, ...r, active: true, online: false, status, reviewNote: null, documentPhotoId: null, location: null, payoutPhone: null, createdAt: new Date(),
      });
    return (await this.findByUser(userId))!;
  }
  async update(userId: string, changes: DriverChanges) {
    Object.assign(this.drivers.find((d) => d.userId === userId)!, changes);
    return (await this.findByUser(userId))!;
  }
  async saveLocation(userId: string, point: GeoPoint, at: Date) {
    this.drivers.find((d) => d.userId === userId)!.location = { ...point, at };
  }
  async listByStatus(status: DriverRecord['status'], limit: number) {
    return this.drivers.filter((d) => d.status === status && d.active).slice(0, limit).map((d) => structuredClone(d));
  }
}

/** Repartidor aprobado y conectado para las pruebas. */
export function makeDriver(userId: string, overrides: Partial<DriverRecord> = {}): DriverRecord {
  return {
    userId, vehicle: 'Moto', plate: 'B7K-482', online: true, active: true, status: 'approved', dniNumber: '12345678', licenseNumber: 'Q12345678',
    documentPhotoId: null, reviewNote: null, location: null, payoutPhone: null, createdAt: new Date(), ...overrides,
  };
}

export class InMemoryOrdersRepository implements OrdersRepository {
  orders: OrderRecord[] = [];
  constructor(
    private readonly businesses = new InMemoryBusinessesRepository(),
    private readonly drivers?: InMemoryDriversRepository,
  ) {}
  async create({ businessId, pickup, ...order }: NewOrder) {
    const found = this.businesses.businesses.find((b) => b.id === businessId);
    const business = found ? { id: found.id, name: found.name, ownerId: found.ownerId, address: found.address, location: found.location ?? null, bigOrder: bigOrderRulesOf(found) } : null;
    const now = new Date();
    const record: OrderRecord = {
      ...order,
      business,
      delivery: null,
      driverId: null,
      driverLocation: null,
      deliveryCodeAttempts: 0,
      rating: null,
      offerRadiusKm: null,
      offerWaveAt: null,
      reservedFor: null,
      pickup: pickup ?? null,
      deliveryPhotoId: null,
      deliveredWithoutCode: false,
      claims: [],
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
  async listByStatus(statuses: OrderStatus[], limit: number) {
    return this.orders.filter((o) => statuses.includes(o.status)).slice(0, limit).map((o) => this.withLocation(o));
  }
  async search({ statuses, query, limit }: AdminOrderFilter) {
    const q = query?.trim();
    return [...this.orders]
      .reverse()
      .filter((o) => (!statuses?.length || statuses.includes(o.status)) && (!q || o.id.includes(q)))
      .slice(0, limit)
      .map((o) => this.withLocation(o));
  }
  async rate(id: string, rating: Omit<OrderRating, 'at'>, at: Date) {
    const order = this.orders.find((o) => o.id === id);
    if (!order || order.rating) return null;
    order.rating = { ...rating, at: at.toISOString() };
    return this.withLocation(order);
  }
  async ratingSummaries(businessIds: string[]) {
    return new Map(await Promise.all(businessIds.map(async (id) => [id, await this.ratingSummary({ businessId: id })] as const)));
  }
  async driverRatingSummaries(driverIds: string[]) {
    return new Map(await Promise.all(driverIds.map(async (id) => [id, await this.ratingSummary({ driverId: id })] as const)));
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
  async widenOffer(id: string, radiusKm: number | null, at: Date) {
    const order = this.orders.find((o) => o.id === id && o.status === 'searching_driver' && !o.driverId);
    if (!order) return null;
    Object.assign(order, { offerRadiusKm: radiusKm, offerWaveAt: at });
    return this.withLocation(order);
  }
  async reserveOffer(id: string, reservation: OfferReservation | null) {
    const order = this.orders.find((o) => o.id === id && o.status === 'searching_driver' && !o.driverId);
    if (!order) return null;
    order.reservedFor = reservation;
    return this.withLocation(order);
  }
  async updateIfStatus(id: string, expected: OrderStatus, { note, offer, reservation, ...changes }: OrderChanges) {
    const order = this.orders.find((o) => o.id === id);
    if (!order || order.status !== expected) return null;
    if (changes.status !== expected || note) order.timeline.push({ status: changes.status, at: new Date().toISOString(), ...(note ? { note } : {}) });
    Object.assign(order, changes, { updatedAt: new Date() }, offer ? { offerRadiusKm: offer.radiusKm, offerWaveAt: offer.at } : {}, reservation !== undefined ? { reservedFor: reservation } : {});
    return this.withLocation(order);
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
  constructor(readonly provider: 'onesignal' | 'brevo' | 'dev' = 'onesignal') {}
  sms: { phone: string; text: string }[] = [];
  emails: { to: string; subject: string; html: string; text?: string }[] = [];
  async sendSms(phone: string, text: string) {
    this.sms.push({ phone, text });
  }
  async sendEmail(to: string, subject: string, html: string, text?: string) {
    this.emails.push({ to, subject, html, text });
  }
  lastSmsCode() {
    return this.sms.at(-1)!.text.match(/(\d{6})/)![1];
  }
  lastEmailCode() {
    return this.emails.at(-1)!.subject.match(/(\d{6})/)![1];
  }
}

export class InMemoryDriverLedger implements DriverLedgerRepository {
  entries: LedgerEntryRecord[] = [];
  constructor(private readonly drivers?: InMemoryDriversRepository) {}
  private counts = (e: LedgerEntryRecord) => e.status !== 'failed';
  async recordDelivery(e: { driverId: string; orderId: string; feeCents: number; commissionCents: number; tipCents: number; cashCents?: number }) {
    if (this.entries.some((x) => x.orderId === e.orderId && x.kind === 'delivery_fee')) return false;
    const base = { driverId: e.driverId, orderId: e.orderId, status: 'posted' as const, transferId: null, failureReason: null, reason: null, createdAt: new Date() };
    this.entries.push({ ...base, id: nextId('le'), kind: 'delivery_fee', amountCents: e.feeCents });
    this.entries.push({ ...base, id: nextId('le'), kind: 'commission', amountCents: -e.commissionCents });
    if (e.tipCents > 0) this.entries.push({ ...base, id: nextId('le'), kind: 'tip', amountCents: e.tipCents });
    if ((e.cashCents ?? 0) > 0) this.entries.push({ ...base, id: nextId('le'), kind: 'cash_collected', amountCents: -(e.cashCents ?? 0) });
    return true;
  }
  async recordCommissionPayment(driverId: string, amountCents: number) {
    this.entries.push({ driverId, orderId: null, status: 'posted', transferId: null, failureReason: null, reason: null, createdAt: new Date(), id: nextId('le'), kind: 'commission_payment', amountCents });
  }
  async balance(driverId: string) {
    const mine = this.entries.filter((e) => e.driverId === driverId);
    return {
      availableCents: mine.filter(this.counts).reduce((s, e) => s + e.amountCents, 0),
      pendingPayoutCents: 0 - mine.filter((e) => e.kind === 'payout' && e.status === 'pending').reduce((s, e) => s + e.amountCents, 0),
    };
  }
  async totals(driverId: string, since?: Date) {
    const mine = this.entries.filter((e) => e.driverId === driverId && e.kind !== 'payout' && (!since || e.createdAt >= since));
    const sum = (kind: string) => mine.filter((e) => e.kind === kind).reduce((s, e) => s + e.amountCents, 0);
    return { netCents: sum('delivery_fee') + sum('commission') + sum('tip'), deliveries: mine.filter((e) => e.kind === 'delivery_fee').length, tipsCents: sum('tip'), commissionCents: -sum('commission') };
  }
  async list(driverId: string, limit: number) {
    return this.entries.filter((e) => e.driverId === driverId).reverse().slice(0, limit);
  }
  async reservePayout(driverId: string, minCents: number, reason: 'manual' | 'auto') {
    if (this.entries.some((e) => e.driverId === driverId && e.kind === 'payout' && e.status === 'pending')) return 'pending' as const;
    const { availableCents } = await this.balance(driverId);
    if (availableCents < minCents) return 'no_balance' as const;
    const entry: LedgerEntryRecord = { id: nextId('po'), driverId, orderId: null, kind: 'payout', amountCents: -availableCents, status: 'pending', transferId: null, failureReason: null, reason, createdAt: new Date() };
    this.entries.push(entry);
    return { ...entry };
  }
  async findPayout(id: string) {
    const e = this.entries.find((x) => x.id === id && x.kind === 'payout');
    return e ? { ...e } : null;
  }
  async settlePayout(id: string, status: 'paid' | 'failed', transferId: string | null, failureReason: string | null) {
    const e = this.entries.find((x) => x.id === id && x.kind === 'payout' && x.status === 'pending');
    if (!e) return null;
    Object.assign(e, { status, transferId, failureReason });
    return { ...e };
  }
  async stuckPayouts(before: Date) {
    return this.entries.filter((e) => e.kind === 'payout' && e.status === 'pending' && e.createdAt < before).map((e) => ({ ...e }));
  }
  async duePayouts(minCents: number) {
    const ids = (this.drivers?.drivers ?? []).filter((d) => d.active && d.payoutPhone).map((d) => d.userId);
    const due: string[] = [];
    for (const id of ids) {
      if (this.entries.some((e) => e.driverId === id && e.kind === 'payout' && e.status === 'pending')) continue;
      if ((await this.balance(id)).availableCents >= minCents) due.push(id);
    }
    return due;
  }
}

/** Los reclamos también se ven dentro del pedido (como el include de Prisma). */
export class InMemoryClaims implements ClaimsRepository {
  claims: ClaimRecord[] = [];
  constructor(private readonly orders: InMemoryOrdersRepository) {}
  private sync(orderId: string) {
    const order = this.orders.orders.find((o) => o.id === orderId);
    if (order) order.claims = this.claims.filter((c) => c.orderId === orderId).map((c) => ({ ...c })).reverse();
  }
  async create(claim: NewClaim) {
    const record: ClaimRecord = { ...claim, id: nextId('cl'), status: 'open', refundCents: null, refundRef: null, providerRefundId: null, resolutionNote: '', resolvedById: null, createdAt: new Date(), resolvedAt: null };
    this.claims.push(record);
    this.sync(claim.orderId);
    return { ...record };
  }
  async findById(id: string) {
    const c = this.claims.find((x) => x.id === id);
    return c ? { ...c } : null;
  }
  async listByStatus(statuses: ClaimStatus[], limit: number) {
    return this.claims.filter((c) => statuses.includes(c.status)).slice(0, limit).map((c) => ({ ...c }));
  }
  async updateIfStatus(id: string, expected: ClaimStatus, changes: ClaimChanges) {
    const c = this.claims.find((x) => x.id === id && x.status === expected);
    if (!c) return null;
    Object.assign(c, changes);
    this.sync(c.orderId);
    return { ...c };
  }
}

export class InMemoryPhotos implements PhotosRepository {
  owners = new Map<string, string>();
  async create(id: string, uploaderId: string) {
    this.owners.set(id, uploaderId);
  }
  async uploaderOf(id: string) {
    return this.owners.get(id) ?? null;
  }
}

/** Cupones: los usos salen de los pedidos con ese cupón que siguen vivos (como el join de Prisma). */
export class InMemoryCoupons implements CouponsRepository {
  coupons: CouponRecord[] = [];
  constructor(private readonly orders: InMemoryOrdersRepository) {}
  private static readonly FREED: OrderStatus[] = ['cancelled', 'rejected', 'payment_expired'];
  async findByCode(code: string) {
    const c = this.coupons.find((x) => x.code === code);
    return c ? { ...c } : null;
  }
  async create(c: NewCoupon) {
    const record: CouponRecord = { ...c, active: true, startsAt: null, createdAt: new Date() };
    this.coupons.push(record);
    return { ...record };
  }
  async setActive(code: string, active: boolean) {
    const c = this.coupons.find((x) => x.code === code);
    if (!c) return null;
    c.active = active;
    return { ...c };
  }
  async list(limit: number) {
    return [...this.coupons].reverse().slice(0, limit).map((c) => ({ ...c }));
  }
  async countUses(code: string, userId?: string) {
    return this.orders.orders.filter((o) => o.couponCode === code && (!userId || o.userId === userId) && !InMemoryCoupons.FREED.includes(o.status)).length;
  }
  async countLiveOrders(userId: string) {
    return this.orders.orders.filter((o) => o.userId === userId && !InMemoryCoupons.FREED.includes(o.status)).length;
  }
}

export class InMemoryAddresses implements AddressesRepository {
  addresses: (SavedAddress & { userId: string })[] = [];
  async list(userId: string, limit: number) {
    return this.addresses
      .filter((a) => a.userId === userId)
      .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
      .slice(0, limit)
      .map(({ userId: _, ...a }) => a);
  }
  async remember(userId: string, address: AddressInput, at: Date, keep: number) {
    const found = this.addresses.find((a) => a.userId === userId && a.line === address.line);
    if (found) Object.assign(found, { reference: address.reference, lastUsedAt: at.toISOString(), ...(address.location ? { location: address.location } : {}) });
    else this.addresses.push({ id: nextId('ad'), userId, label: '', line: address.line, reference: address.reference, location: address.location ?? null, lastUsedAt: at.toISOString() });
    const mine = (await this.list(userId, 1000)).map((a) => a.id);
    this.addresses = this.addresses.filter((a) => a.userId !== userId || mine.indexOf(a.id) < keep);
  }
  async setLabel(userId: string, id: string, label: string) {
    const a = this.addresses.find((x) => x.id === id && x.userId === userId);
    if (!a) return null;
    a.label = label;
    const { userId: _, ...rest } = a;
    return rest;
  }
  async delete(userId: string, id: string) {
    const before = this.addresses.length;
    this.addresses = this.addresses.filter((a) => !(a.id === id && a.userId === userId));
    return this.addresses.length < before;
  }
}

export class InMemoryStoreLedger implements StoreLedgerRepository {
  entries: StoreLedgerEntryRecord[] = [];
  constructor(private readonly businesses?: InMemoryBusinessesRepository) {}
  private counts = (e: StoreLedgerEntryRecord) => e.status !== 'failed';
  async recordSale(e: { businessId: string; orderId: string; saleCents: number; commissionCents: number }) {
    if (this.entries.some((x) => x.orderId === e.orderId && x.kind === 'sale')) return false;
    const base = { businessId: e.businessId, orderId: e.orderId, status: 'posted' as const, transferId: null, failureReason: null, reason: null, createdAt: new Date() };
    this.entries.push({ ...base, id: nextId('sl'), kind: 'sale', amountCents: e.saleCents });
    if (e.commissionCents > 0) this.entries.push({ ...base, id: nextId('sl'), kind: 'commission', amountCents: -e.commissionCents });
    return true;
  }
  async balance(businessId: string) {
    const mine = this.entries.filter((e) => e.businessId === businessId);
    return {
      availableCents: mine.filter(this.counts).reduce((s, e) => s + e.amountCents, 0),
      pendingPayoutCents: 0 - mine.filter((e) => e.kind === 'payout' && e.status === 'pending').reduce((s, e) => s + e.amountCents, 0),
    };
  }
  async list(businessId: string, limit: number) {
    return this.entries.filter((e) => e.businessId === businessId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
  }
  async reservePayout(businessId: string, minCents: number, reason: 'manual' | 'auto') {
    if (this.entries.some((e) => e.businessId === businessId && e.kind === 'payout' && e.status === 'pending')) return 'pending' as const;
    const { availableCents } = await this.balance(businessId);
    if (availableCents < minCents) return 'no_balance' as const;
    const entry: StoreLedgerEntryRecord = { id: `sp_${nextId('n')}`, businessId, orderId: null, kind: 'payout', amountCents: -availableCents, status: 'pending', transferId: null, failureReason: null, reason, createdAt: new Date() };
    this.entries.push(entry);
    return { ...entry };
  }
  async findPayout(id: string) {
    const e = this.entries.find((x) => x.id === id && x.kind === 'payout');
    return e ? { ...e } : null;
  }
  async settlePayout(id: string, status: 'paid' | 'failed', transferId: string | null, failureReason: string | null) {
    const e = this.entries.find((x) => x.id === id && x.kind === 'payout' && x.status === 'pending');
    if (!e) return null;
    Object.assign(e, { status, transferId, failureReason });
    return { ...e };
  }
  async stuckPayouts(before: Date) {
    return this.entries.filter((e) => e.kind === 'payout' && e.status === 'pending' && e.createdAt < before).map((e) => ({ ...e }));
  }
  async duePayouts(minCents: number) {
    const due: string[] = [];
    for (const b of this.businesses?.businesses ?? []) {
      if (!b.payoutPhone || this.entries.some((e) => e.businessId === b.id && e.kind === 'payout' && e.status === 'pending')) continue;
      if ((await this.balance(b.id)).availableCents >= minCents) due.push(b.id);
    }
    return due;
  }
}
