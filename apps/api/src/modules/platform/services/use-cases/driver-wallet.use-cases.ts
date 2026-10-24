import { Inject, Injectable } from '@nestjs/common';
import type { DriverWallet, PayoutResult, PushPayload } from '@parla/types';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../../kernel/domain-error';
import { AUTO_PAYOUT_AT, normalizePayoutPhone } from '../../../../kernel/driver-earnings';
import { formatSoles } from '../../../../kernel/order-rules';
import { NotificationDispatcher } from '../../messaging/push/use-cases/notification-dispatcher';
import { DRIVER_LEDGER_REPOSITORY, type DriverLedgerRepository, type LedgerEntryRecord } from '../driver-ledger.repository';
import { DriverPayPolicy } from '../driver-pay.policy';
import { DRIVERS_REPOSITORY, type DriverRecord, type DriversRepository } from '../drivers.repository';

const WALLET_ENTRIES = 40;

async function requireActiveDriver(drivers: DriversRepository, userId: string): Promise<DriverRecord> {
  const driver = await drivers.findByUser(userId);
  if (!driver?.active) throw new ForbiddenError('Tu cuenta no es de repartidor de Rapidito');
  return driver;
}

function toPayoutResult(e: LedgerEntryRecord): PayoutResult {
  return { payoutId: e.id, amountCents: -e.amountCents, status: e.status === 'posted' ? 'paid' : e.status, transferId: e.transferId };
}

/** La billetera del repartidor: saldo, depósito en curso, número de PagaYa y movimientos. */
@Injectable()
export class GetDriverWalletUseCase {
  constructor(
    @Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository,
    @Inject(DRIVER_LEDGER_REPOSITORY) private readonly ledger: DriverLedgerRepository,
    private readonly pay: DriverPayPolicy,
  ) {}

  async execute(userId: string): Promise<DriverWallet> {
    const driver = await requireActiveDriver(this.drivers, userId);
    const [{ availableCents, pendingPayoutCents }, entries] = await Promise.all([this.ledger.balance(userId), this.ledger.list(userId, WALLET_ENTRIES)]);
    return {
      balanceCents: availableCents,
      debtCents: Math.max(0, -availableCents),
      maxDebtCents: this.pay.config.maxDebtCents,
      pendingPayoutCents,
      payoutPhone: driver.payoutPhone,
      autoPayoutAt: AUTO_PAYOUT_AT,
      minAutoPayoutCents: this.pay.config.minAutoPayoutCents,
      driverSharePercent: this.pay.sharePercent,
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
export class SetPayoutPhoneUseCase {
  constructor(@Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository) {}

  async execute(userId: string, phone: string): Promise<{ payoutPhone: string }> {
    await requireActiveDriver(this.drivers, userId);
    const payoutPhone = normalizePayoutPhone(phone);
    await this.drivers.update(userId, { payoutPhone });
    return { payoutPhone };
  }
}

/**
 * Para el gateway: reserva todo el saldo en un depósito pendiente, antes de transferir. Así el mismo
 * dinero no se puede depositar dos veces aunque se pida dos veces a la vez.
 */
@Injectable()
export class ReservePayoutUseCase {
  constructor(
    @Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository,
    @Inject(DRIVER_LEDGER_REPOSITORY) private readonly ledger: DriverLedgerRepository,
    private readonly pay: DriverPayPolicy,
  ) {}

  async execute(userId: string, reason: 'manual' | 'auto'): Promise<{ payoutId: string; amountCents: number; destination: string }> {
    const driver = await this.drivers.findByUser(userId);
    if (!driver) throw new NotFoundError('Repartidor no encontrado');
    if (!driver.active) throw new ConflictError('Tu cuenta ya no es de repartidor');
    if (!driver.payoutPhone) throw new ConflictError('Agrega tu número de PagaYa en tu perfil para recibir tus ganancias');
    const min = reason === 'auto' ? this.pay.config.minAutoPayoutCents : this.pay.config.minManualPayoutCents;
    const reserved = await this.ledger.reservePayout(userId, min, reason);
    if (reserved === 'pending') throw new ConflictError('Ya tienes un retiro en curso');
    if (reserved === 'no_balance') throw new ConflictError(`No tienes saldo para retirar (mínimo ${formatSoles(min)})`);
    return { payoutId: reserved.id, amountCents: -reserved.amountCents, destination: driver.payoutPhone };
  }
}

/** Para el gateway: cierra el depósito tras la transferencia (pagado) o la devuelve al saldo (fallido). */
@Injectable()
export class SettlePayoutUseCase {
  constructor(
    @Inject(DRIVER_LEDGER_REPOSITORY) private readonly ledger: DriverLedgerRepository,
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
      const push: PushPayload = {
        title: 'Te depositamos tus ganancias',
        body: `${formatSoles(-settled.amountCents)} ya están en tu PagaYa.`,
        url: '/app/rapidito/perfil',
        tag: `payout-${payoutId}`,
      };
      void this.notifications.notify([settled.driverId], () => push);
    }
    return toPayoutResult(settled);
  }
}

/** Para el depósito automático diario: repartidores con saldo suficiente y número de PagaYa. */
@Injectable()
export class DuePayoutsUseCase {
  constructor(
    @Inject(DRIVER_LEDGER_REPOSITORY) private readonly ledger: DriverLedgerRepository,
    private readonly pay: DriverPayPolicy,
  ) {}

  async execute(): Promise<{ userId: string }[]> {
    return (await this.ledger.duePayouts(this.pay.config.minAutoPayoutCents)).map((userId) => ({ userId }));
  }
}

/**
 * Para la conciliación del gateway: depósitos que siguen pendientes hace rato (la transferencia pudo
 * hacerse sin que llegara la confirmación). El gateway reintenta con la misma referencia, que PagaYa
 * no duplica, y los cierra.
 */
@Injectable()
export class StuckPayoutsUseCase {
  constructor(
    @Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository,
    @Inject(DRIVER_LEDGER_REPOSITORY) private readonly ledger: DriverLedgerRepository,
  ) {}

  async execute(olderThanMinutes: number, now = new Date()): Promise<{ payoutId: string; amountCents: number; destination: string }[]> {
    const minutes = Number.isFinite(olderThanMinutes) && olderThanMinutes >= 1 ? olderThanMinutes : 10;
    const stuck = await this.ledger.stuckPayouts(new Date(now.getTime() - minutes * 60_000));
    const result: { payoutId: string; amountCents: number; destination: string }[] = [];
    for (const p of stuck) {
      const driver = await this.drivers.findByUser(p.driverId);
      result.push({ payoutId: p.id, amountCents: -p.amountCents, destination: driver?.payoutPhone ?? '' });
    }
    return result;
  }
}
