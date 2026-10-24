import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { PushPayload } from '@parla/types';
import { bigOrderEscalation, isBigOrder } from '../../../../kernel/big-order';
import { formatSoles } from '../../../../kernel/order-rules';
import { AUTH_REPOSITORY, type AuthRepository } from '../../identity/auth/auth.repository';
import { NotificationDispatcher } from '../../messaging/push/use-cases/notification-dispatcher';
import { ORDERS_REPOSITORY, type OrderRecord, type OrdersRepository } from '../orders.repository';

const MINUTE = 60_000;
const WATCH_LIMIT = 200;

/** Desde cuándo está pagado y esperando a la tienda. */
function paidSince(order: OrderRecord): number {
  const entry = [...order.timeline].reverse().find((t) => t.status === 'paid');
  return (entry ? new Date(entry.at) : order.updatedAt).getTime();
}

const remindPush = (order: OrderRecord, minutes: number): PushPayload => ({
  title: 'Pedido GRANDE sin confirmar',
  body: `Lleva ${minutes} minutos esperando: ${formatSoles(order.totalCents)}. Confírmalo con el cliente.`,
  url: `/app/negocio/pedidos/${order.id}`,
  tag: `business-order-${order.id}`,
});

const supportPush = (order: OrderRecord, minutes: number): PushPayload => ({
  title: 'Pedido grande sin atender',
  body: `${order.business?.name ?? 'Una tienda'} no acepta un pedido de ${formatSoles(order.totalCents)} desde hace ${minutes} minutos.`,
  url: `/app/admin/pedidos`,
  tag: `big-order-support-${order.id}`,
});

export interface BigOrderWatchResult {
  /** Pedidos grandes a cuya tienda se le volvió a avisar. */
  reminded: string[];
  /** Pedidos grandes por los que se avisó a soporte. */
  escalated: string[];
}

/**
 * Vigilancia de los pedidos grandes que la tienda todavía no acepta: a los 10 minutos un segundo aviso a la tienda y a
 * los 20 minutos un aviso a soporte (cada uno una sola vez). El cliente ve siempre el WhatsApp de la tienda para hablarle.
 */
@Injectable()
export class WatchBigOrdersUseCase {
  /** Qué avisos ya se mandaron por pedido (en memoria: si el core se reinicia, a lo sumo se repite uno). */
  private readonly level = new Map<string, 1 | 2>();

  constructor(
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    private readonly notifications: NotificationDispatcher,
  ) {}

  async execute(now = new Date()): Promise<BigOrderWatchResult> {
    const result: BigOrderWatchResult = { reminded: [], escalated: [] };
    const { firstMinutes, secondMinutes } = bigOrderEscalation();
    const waiting = (await this.orders.listByStatus(['paid'], WATCH_LIMIT)).filter((o) => o.business && isBigOrder(o, o.business.bigOrder));

    for (const order of waiting) {
      const minutes = Math.floor((now.getTime() - paidSince(order)) / MINUTE);
      const done = this.level.get(order.id) ?? 0;
      if (minutes >= firstMinutes && done < 1) {
        this.level.set(order.id, 1);
        void this.notifications.notify([order.business!.ownerId], () => remindPush(order, minutes));
        result.reminded.push(order.id);
      }
      if (minutes >= secondMinutes && done < 2) {
        this.level.set(order.id, 2);
        const admins = await this.users.listAdminIds();
        if (admins.length) void this.notifications.notify(admins, () => supportPush(order, minutes));
        result.escalated.push(order.id);
      }
    }

    // Se olvidan los que ya no esperan (aceptados, rechazados o cancelados).
    const stillWaiting = new Set(waiting.map((o) => o.id));
    for (const id of this.level.keys()) if (!stillWaiting.has(id)) this.level.delete(id);
    return result;
  }
}

/** Corre la vigilancia de pedidos grandes cada `BIG_ORDER_WATCH_INTERVAL_MS` (60 s por defecto; 0 la apaga). */
@Injectable()
export class BigOrderWatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('BigOrderWatch');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly watch: WatchBigOrdersUseCase) {}

  onModuleInit(): void {
    const interval = Number(process.env.BIG_ORDER_WATCH_INTERVAL_MS ?? 60_000);
    if (!(interval > 0)) return;
    this.timer = setInterval(() => void this.tick(), interval);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const { reminded, escalated } = await this.watch.execute();
      if (reminded.length || escalated.length) this.logger.log(`Pedidos grandes: ${reminded.length} recordados · ${escalated.length} a soporte`);
    } catch (error) {
      this.logger.error(`La vigilancia de pedidos grandes falló: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
