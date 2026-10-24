import { Inject, Injectable } from '@nestjs/common';
import type { AdminClaim, ClaimItem, ClaimReason, ClaimStatus, CreateClaimRequest, OrderClaim, PushPayload } from '@parla/types';
import { randomBytes } from 'node:crypto';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../../kernel/domain-error';
import { formatSoles } from '../../../../kernel/order-rules';
import { AUTH_REPOSITORY, type AuthRepository } from '../../identity/auth/auth.repository';
import { NotificationDispatcher } from '../../messaging/push/use-cases/notification-dispatcher';
import { CLAIMS_REPOSITORY, type ClaimRecord, type ClaimsRepository } from '../claims.repository';
import { ORDERS_REPOSITORY, type OrderRecord, type OrdersRepository } from '../orders.repository';
import { PHOTOS_REPOSITORY, type PhotosRepository } from '../photos.repository';
import { OrderEvents, toOrderClaim } from './orders.use-cases';
import { assertOwnPhoto } from './photos.use-cases';

/** Como en Rappi: se puede reclamar hasta 48 horas después de recibir el pedido. */
export const CLAIM_WINDOW_HOURS = 48;
const REASONS: readonly ClaimReason[] = ['missing_items', 'damaged', 'wrong_items', 'not_delivered', 'other'];
/** Motivos en los que hay que marcar qué productos (la devolución sugerida es lo que costaron). */
const NEEDS_ITEMS: readonly ClaimReason[] = ['missing_items', 'damaged', 'wrong_items'];
const ADMIN_LIMIT = 100;

/** Soporte de Parla: aprueba repartidores y resuelve reclamos. */
export async function requireAdmin(users: AuthRepository, userId: string): Promise<void> {
  const [user] = await users.findActiveByIds([userId]);
  if (!user?.isAdmin) throw new ForbiddenError('Solo soporte puede hacer esto');
}

/**
 * Soporte controla Parla, no participa en ella como un usuario más: no abre tiendas ni reparte.
 * Se llama antes de dar de alta un negocio o un repartidor.
 */
export async function rejectIfSupport(users: AuthRepository, userId: string, action: string): Promise<void> {
  const [user] = await users.findActiveByIds([userId]);
  if (user?.isAdmin) throw new ForbiddenError(`Las cuentas de soporte no pueden ${action}: solo administran Parla`);
}

/**
 * Lo que todavía se puede devolver de un pedido: el total menos lo ya devuelto (cancelación completa
 * o reclamos devueltos o en curso). `exceptClaimId` deja fuera el reclamo que se está resolviendo.
 */
export function refundableCents(order: OrderRecord, exceptClaimId?: string): number {
  if (order.payment.refundedAt) return 0;
  const used = order.claims
    .filter((c) => c.id !== exceptClaimId && (c.status === 'refunded' || c.status === 'refunding'))
    .reduce((sum, c) => sum + (c.refundCents ?? 0), 0);
  return Math.max(0, order.totalCents - used);
}

function deliveredAt(order: OrderRecord): Date | null {
  const entry = order.timeline.find((t) => t.status === 'delivered');
  return entry ? new Date(entry.at) : null;
}

/**
 * «Tengo un problema con mi pedido»: faltó algo, llegó mal, llegó otra cosa o no llegó. Se marca qué
 * productos y cuántos; la devolución sugerida es lo que costaron (o todo, si no llegó). Uno abierto a
 * la vez por pedido; soporte lo resuelve.
 */
@Injectable()
export class CreateClaimUseCase {
  constructor(
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    @Inject(CLAIMS_REPOSITORY) private readonly claims: ClaimsRepository,
    @Inject(PHOTOS_REPOSITORY) private readonly photos: PhotosRepository,
    private readonly events: OrderEvents,
  ) {}

  async execute(userId: string, orderId: string, input: CreateClaimRequest, now = new Date()): Promise<OrderClaim> {
    const order = await this.orders.findById(orderId);
    if (!order || order.userId !== userId) throw new NotFoundError('Pedido no encontrado');
    const at = deliveredAt(order);
    if (order.status !== 'delivered' || !at) throw new ConflictError('Podrás reclamar cuando recibas tu pedido');
    if (now.getTime() - at.getTime() > CLAIM_WINDOW_HOURS * 3_600_000) throw new ConflictError(`Los reclamos se hacen hasta ${CLAIM_WINDOW_HOURS} horas después de recibir el pedido`);
    if (order.claims.some((c) => c.status === 'open' || c.status === 'refunding')) throw new ConflictError('Ya tienes un reclamo abierto para este pedido');
    if (!REASONS.includes(input.reason)) throw new ValidationError('Elige qué pasó con tu pedido');

    const items: ClaimItem[] = [];
    for (const it of input.items ?? []) {
      const line = order.lines.find((l) => l.productId === it.productId);
      if (!line || !Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > line.quantity) throw new ValidationError('Revisa los productos y las cantidades');
      if (items.some((x) => x.productId === it.productId)) throw new ValidationError('Hay un producto repetido');
      items.push({ productId: line.productId, name: line.name, quantity: it.quantity, totalCents: line.unitPriceCents * it.quantity });
    }
    if (NEEDS_ITEMS.includes(input.reason) && items.length === 0) throw new ValidationError('Marca qué productos tuvieron el problema');
    const comment = (input.comment ?? '').trim().slice(0, 500);
    if (input.reason === 'other' && !comment) throw new ValidationError('Cuéntanos qué pasó');
    if (input.photoId) await assertOwnPhoto(this.photos, userId, input.photoId);

    const refundable = refundableCents(order);
    if (refundable === 0) throw new ConflictError('Este pedido ya se devolvió por completo');
    const suggested = input.reason === 'not_delivered' ? refundable : Math.min(refundable, items.reduce((s, i) => s + i.totalCents, 0));
    const claim = await this.claims.create({ orderId, userId, reason: input.reason, comment, items, photoId: input.photoId ?? null, suggestedCents: suggested });
    const updated = await this.orders.findById(orderId);
    if (updated) this.events.changed(updated, null, false);
    return toOrderClaim(claim);
  }
}

/** Un reclamo para soporte: con el pedido, las personas y lo que queda por devolver. */
async function toAdminClaim(c: ClaimRecord, orders: OrdersRepository, users: AuthRepository): Promise<AdminClaim> {
  const order = await orders.findById(c.orderId);
  if (!order) throw new NotFoundError('Pedido no encontrado');
  const [customer] = await users.findActiveByIds([order.userId]);
  return {
    ...toOrderClaim(c),
    customerName: customer?.displayName ?? 'Cuenta eliminada',
    businessName: order.business?.name ?? null,
    driverName: order.delivery?.driverName ?? null,
    orderTotalCents: order.totalCents,
    refundableCents: refundableCents(order, c.id),
    lines: order.lines,
    hasDeliveryPhoto: !!order.deliveryPhotoId,
    deliveredWithoutCode: order.deliveredWithoutCode,
  };
}

/** Bandeja de soporte: reclamos abiertos (o resueltos), los más antiguos primero. */
@Injectable()
export class ListAdminClaimsUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(CLAIMS_REPOSITORY) private readonly claims: ClaimsRepository,
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
  ) {}

  async execute(adminId: string, view: 'open' | 'resolved'): Promise<AdminClaim[]> {
    await requireAdmin(this.users, adminId);
    const statuses: ClaimStatus[] = view === 'open' ? ['open', 'refunding'] : ['refunded', 'rejected'];
    const list = await this.claims.listByStatus(statuses, ADMIN_LIMIT);
    return Promise.all((view === 'resolved' ? list.reverse() : list).map((c) => toAdminClaim(c, this.orders, this.users)));
  }
}

@Injectable()
export class GetAdminClaimUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(CLAIMS_REPOSITORY) private readonly claims: ClaimsRepository,
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
  ) {}

  async execute(adminId: string, claimId: string): Promise<AdminClaim> {
    await requireAdmin(this.users, adminId);
    const claim = await this.claims.findById(claimId);
    if (!claim) throw new NotFoundError('Reclamo no encontrado');
    return toAdminClaim(claim, this.orders, this.users);
  }
}

function claimPush(c: ClaimRecord, title: string, body: string): PushPayload {
  return { title, body, url: `/app/pedidos/${c.orderId}`, tag: `claim-${c.id}` };
}

/** Soporte rechaza el reclamo con un motivo que ve el cliente. */
@Injectable()
export class RejectClaimUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(CLAIMS_REPOSITORY) private readonly claims: ClaimsRepository,
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    private readonly events: OrderEvents,
    private readonly notifications: NotificationDispatcher,
  ) {}

  async execute(adminId: string, claimId: string, note: string): Promise<AdminClaim> {
    await requireAdmin(this.users, adminId);
    const reason = note.trim().slice(0, 300);
    if (!reason) throw new ValidationError('Escribe el motivo para el cliente');
    const claim = await this.claims.updateIfStatus(claimId, 'open', { status: 'rejected', resolutionNote: reason, resolvedById: adminId, resolvedAt: new Date() });
    if (!claim) throw new ConflictError('Este reclamo ya no está abierto');
    const order = await this.orders.findById(claim.orderId);
    if (order) this.events.changed(order, null, false);
    const push = claimPush(claim, 'Revisamos tu reclamo', reason);
    void this.notifications.notify([claim.userId], () => push);
    return toAdminClaim(claim, this.orders, this.users);
  }
}

/**
 * Para el gateway: reserva la devolución de un reclamo antes de pedírsela a PagaYa. Si ya estaba en
 * curso con el mismo monto, devuelve la misma referencia (PagaYa no devuelve dos veces la misma).
 */
@Injectable()
export class ReserveClaimRefundUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(CLAIMS_REPOSITORY) private readonly claims: ClaimsRepository,
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
  ) {}

  async execute(adminId: string, claimId: string, amountCents: number): Promise<{ refundRef: string; chargeId: string; amountCents: number }> {
    await requireAdmin(this.users, adminId);
    const claim = await this.claims.findById(claimId);
    if (!claim) throw new NotFoundError('Reclamo no encontrado');
    const order = await this.orders.findById(claim.orderId);
    if (!order) throw new NotFoundError('Pedido no encontrado');
    if (!order.payment.chargeId) throw new ConflictError('Este pedido no tiene un cobro para devolver');
    if (claim.status === 'refunding') {
      if (claim.refundCents === amountCents && claim.refundRef) return { refundRef: claim.refundRef, chargeId: order.payment.chargeId, amountCents };
      throw new ConflictError('Ya hay una devolución en curso para este reclamo');
    }
    if (claim.status !== 'open') throw new ConflictError('Este reclamo ya se resolvió');
    if (!Number.isInteger(amountCents) || amountCents < 1) throw new ValidationError('Escribe el monto a devolver');
    const refundable = refundableCents(order, claim.id);
    if (amountCents > refundable) throw new ConflictError(`Solo se pueden devolver ${formatSoles(refundable)} de este pedido`);
    const refundRef = `rf_${randomBytes(10).toString('hex')}`;
    const reserved = await this.claims.updateIfStatus(claimId, 'open', { status: 'refunding', refundRef, refundCents: amountCents, resolvedById: adminId });
    if (!reserved) throw new ConflictError('Este reclamo cambió mientras tanto; vuelve a abrirlo');
    return { refundRef, chargeId: order.payment.chargeId, amountCents };
  }
}

/** Para el gateway: cierra la devolución (hecha → el cliente recibe el aviso; fallida → vuelve a abierto). */
@Injectable()
export class SettleClaimRefundUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(CLAIMS_REPOSITORY) private readonly claims: ClaimsRepository,
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    private readonly events: OrderEvents,
    private readonly notifications: NotificationDispatcher,
  ) {}

  async execute(claimId: string, status: 'refunded' | 'failed', providerRefundId: string | null, failureReason: string | null): Promise<AdminClaim> {
    const claim = await this.claims.findById(claimId);
    if (!claim) throw new NotFoundError('Reclamo no encontrado');
    if (claim.status !== 'refunding') {
      // Idempotente: repetir el cierre ya hecho devuelve el reclamo.
      if ((status === 'refunded' && claim.status === 'refunded') || (status === 'failed' && claim.status === 'open')) return toAdminClaim(claim, this.orders, this.users);
      throw new ConflictError('Este reclamo no tiene una devolución en curso');
    }
    const settled =
      status === 'refunded'
        ? await this.claims.updateIfStatus(claimId, 'refunding', {
            status: 'refunded',
            providerRefundId,
            resolvedAt: new Date(),
            resolutionNote: `Te devolvimos ${formatSoles(claim.refundCents ?? 0)}`,
          })
        : await this.claims.updateIfStatus(claimId, 'refunding', { status: 'open', refundRef: null, refundCents: null, resolutionNote: failureReason ?? '' });
    if (!settled) return toAdminClaim((await this.claims.findById(claimId))!, this.orders, this.users);
    const order = await this.orders.findById(settled.orderId);
    if (order) this.events.changed(order, null, false);
    if (settled.status === 'refunded') {
      const push = claimPush(settled, 'Te devolvimos tu dinero', `${formatSoles(settled.refundCents ?? 0)} por tu reclamo ya están en tu billetera.`);
      void this.notifications.notify([settled.userId], () => push);
    }
    return toAdminClaim(settled, this.orders, this.users);
  }
}
