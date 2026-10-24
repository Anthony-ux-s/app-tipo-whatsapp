import { Inject, Injectable } from '@nestjs/common';
import type { PayoutResult, PushPayload, StoreWallet } from '@parla/types';
import { ConflictError, NotFoundError } from '../../../../kernel/domain-error';
import { AUTO_PAYOUT_AT, normalizePayoutPhone } from '../../../../kernel/driver-earnings';
import { formatSoles } from '../../../../kernel/order-rules';
import { splitStoreSale, storeCommissionPercent } from '../../../../kernel/store-commission';
import { NotificationDispatcher } from '../../messaging/push/use-cases/notification-dispatcher';
import { BUSINESSES_REPOSITORY, type BusinessesRepository, type BusinessRecord } from '../businesses.repository';
import { DriverPayPolicy } from '../driver-pay.policy';
import type { OrderRecord } from '../orders.repository';
import { STORE_LEDGER_REPOSITORY, type StoreLedgerEntryRecord, type StoreLedgerRepository } from '../store-ledger.repository';

const WALLET_ENTRIES = 40;

async function ownStore(businesses: BusinessesRepository, userId: string): Promise<BusinessRecord> {
  const business = await businesses.findByOwner(userId);
  if (!business) throw new NotFoundError('Tu cuenta no tiene una tienda en Parla');
  return business;
}

function toPayoutResult(e: StoreLedgerEntryRecord): PayoutResult {
  return { payoutId: e.id, amountCents: -e.amountCents, status: e.status === 'posted' ? 'paid' : e.status, transferId: e.transferId };
}

/**
 * Una venta entregada suma a la billetera de la tienda: los productos menos la comisión de Parla. La tienda cobra por
 * PagaYa a través de Parla, que se lo deposita. Si la entrega se confirma dos veces, no se anota dos veces.
 */
@Injectable()
export class RecordStoreSaleUseCase {
  constructor(@Inject(STORE_LEDGER_REPOSITORY) private readonly ledger: StoreLedgerRepository) {}

  async execute(order: OrderRecord): Promise<void> {
    if (!order.business) return;
    const { commissionCents } = splitStoreSale(order.subtotalCents, storeCommissionPercent(order.service));
    await this.ledger.recordSale({ businessId: order.business.id, orderId: order.id, saleCents: order.subtotalCents, commissionCents });
  }
}

/** «Mis ventas y depósitos» de la tienda: saldo, depósito en curso, número de PagaYa y movimientos. */
@Injectable()
export class GetStoreWalletUseCase {
  constructor(
    @Inject(BUSINESSES_REPOSITORY) private readonly businesses: BusinessesRepository,
    @Inject(STORE_LEDGER_REPOSITORY) private readonly ledger: StoreLedgerRepository,
    private readonly pay: DriverPayPolicy,
  ) {}

  async execute(userId: string): Promise<StoreWallet> {
    const business = await ownStore(this.businesses, userId);
    const [{ availableCents, pendingPayoutCents }, entries] = await Promise.all([this.ledger.balance(business.id), this.ledger.list(business.id, WALLET_ENTRIES)]);
    return {
      balanceCents: availableCents,
      pendingPayoutCents,
      payoutPhone: business.payoutPhone || null,
      autoPayoutAt: AUTO_PAYOUT_AT,
      minAutoPayoutCents: this.pay.config.minAutoPayoutCents,
      commissionPercent: storeCommissionPercent(business.service),
      entries: entries.map((e) => ({
        id: e.id,
        kind: e.kind,
        amountCents: e.amountCents,
        orderId: e.orderId,
        status: e.kind === 'payout' ? (e.status === 'posted' ? 'paid' : e.status) : null,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }
}

/** El número de PagaYa donde se le deposita (celular de 9 dígitos). */
@Injectable()
export class SetStorePayoutPhoneUseCase {
  constructor(@Inject(BUSINESSES_REPOSITORY) private readonly businesses: BusinessesRepository) {}

  async execute(userId: string, phone: string): Promise<{ payoutPhone: string }> {
    const business = await ownStore(this.businesses, userId);
    const payoutPhone = normalizePayoutPhone(phone);
    await this.businesses.setPayoutPhone(business.id, payoutPhone);
    return { payoutPhone };
  }
}

/** Para el gateway: reserva todo el saldo de la tienda en un depósito pendiente, antes de transferir. */
@Injectable()
export class ReserveStorePayoutUseCase {
  constructor(
    @Inject(BUSINESSES_REPOSITORY) private readonly businesses: BusinessesRepository,
    @Inject(STORE_LEDGER_REPOSITORY) private readonly ledger: StoreLedgerRepository,
    private readonly pay: DriverPayPolicy,
  ) {}

  async execute(userId: string, reason: 'manual' | 'auto'): Promise<{ payoutId: string; amountCents: number; destination: string }> {
    const business = await ownStore(this.businesses, userId);
    if (!business.payoutPhone) throw new ConflictError('Agrega tu número de PagaYa en «Mi negocio» para recibir tus ventas');
    const min = reason === 'auto' ? this.pay.config.minAutoPayoutCents : this.pay.config.minManualPayoutCents;
    const reserved = await this.ledger.reservePayout(business.id, min, reason);
    if (reserved === 'pending') throw new ConflictError('Ya tienes un retiro en curso');
    if (reserved === 'no_balance') throw new ConflictError(`No tienes saldo para retirar (mínimo ${formatSoles(min)})`);
    return { payoutId: reserved.id, amountCents: -reserved.amountCents, destination: business.payoutPhone };
  }
}

/** Para el gateway: cierra el depósito tras la transferencia (pagado) o devuelve el saldo (fallido). */
@Injectable()
export class SettleStorePayoutUseCase {
  constructor(
    @Inject(BUSINESSES_REPOSITORY) private readonly businesses: BusinessesRepository,
    @Inject(STORE_LEDGER_REPOSITORY) private readonly ledger: StoreLedgerRepository,
    private readonly notifications: NotificationDispatcher,
  ) {}

  async execute(payoutId: string, status: 'paid' | 'failed', transferId: string | null, failureReason: string | null): Promise<PayoutResult> {
    const payout = await this.ledger.findPayout(payoutId);
    if (!payout) throw new NotFoundError('Depósito no encontrado');
    if (payout.status !== 'pending') {
      // Idempotente: repetir el mismo cierre devuelve el depósito; cambiarlo, no se puede.
      if (payout.status === status) return toPayoutResult(payout);
      throw new ConflictError('Este depósito ya se cerró');
    }
    const settled = await this.ledger.settlePayout(payoutId, status, transferId, failureReason);
    if (!settled) return toPayoutResult((await this.ledger.findPayout(payoutId))!);
    if (status === 'paid') {
      const owner = (await this.businesses.findById(settled.businessId))?.ownerId;
      const push: PushPayload = {
        title: 'Te depositamos tus ventas',
        body: `${formatSoles(-settled.amountCents)} ya están en tu PagaYa.`,
        url: '/app/negocio',
        tag: `store-payout-${payoutId}`,
      };
      if (owner) void this.notifications.notify([owner], () => push);
    }
    return toPayoutResult(settled);
  }
}

/** Para el depósito automático diario: dueños de tiendas con saldo suficiente y número de PagaYa. */
@Injectable()
export class DueStorePayoutsUseCase {
  constructor(
    @Inject(BUSINESSES_REPOSITORY) private readonly businesses: BusinessesRepository,
    @Inject(STORE_LEDGER_REPOSITORY) private readonly ledger: StoreLedgerRepository,
    private readonly pay: DriverPayPolicy,
  ) {}

  async execute(): Promise<{ userId: string }[]> {
    const ids = await this.ledger.duePayouts(this.pay.config.minAutoPayoutCents);
    const owners = await Promise.all(ids.map(async (id) => (await this.businesses.findById(id))?.ownerId));
    return owners.filter((o): o is string => !!o).map((userId) => ({ userId }));
  }
}

/** Para la conciliación del gateway: depósitos que siguen pendientes hace rato. */
@Injectable()
export class StuckStorePayoutsUseCase {
  constructor(
    @Inject(BUSINESSES_REPOSITORY) private readonly businesses: BusinessesRepository,
    @Inject(STORE_LEDGER_REPOSITORY) private readonly ledger: StoreLedgerRepository,
  ) {}

  async execute(olderThanMinutes: number, now = new Date()): Promise<{ payoutId: string; amountCents: number; destination: string }[]> {
    const minutes = Number.isFinite(olderThanMinutes) && olderThanMinutes >= 1 ? olderThanMinutes : 10;
    const stuck = await this.ledger.stuckPayouts(new Date(now.getTime() - minutes * 60_000));
    const result: { payoutId: string; amountCents: number; destination: string }[] = [];
    for (const p of stuck) {
      const business = await this.businesses.findById(p.businessId);
      result.push({ payoutId: p.id, amountCents: -p.amountCents, destination: business?.payoutPhone ?? '' });
    }
    return result;
  }
}
