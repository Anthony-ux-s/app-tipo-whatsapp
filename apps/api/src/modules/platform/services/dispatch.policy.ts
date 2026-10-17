import { Inject, Injectable } from '@nestjs/common';
import { APP_ENV, type AppEnv } from '../../../config/env.validation';
import { canSeeOffer, firstRadius, nextRadius, type DispatchConfig } from '../../../kernel/dispatch';
import type { DriverRecord } from './drivers.repository';
import type { OrderRecord } from './orders.repository';

/**
 * Ofertas por cercanía según DISPATCH_RADII_KM y DISPATCH_WAVE_MINUTES: a quién se le ofrece un
 * pedido listo y cuándo ampliar el radio.
 */
@Injectable()
export class DispatchPolicy {
  readonly config: DispatchConfig;

  constructor(@Inject(APP_ENV) env: Pick<AppEnv, 'dispatch'>) {
    this.config = env.dispatch;
  }

  /** La primera oleada de un pedido que queda listo (o vuelve a ofrecerse). */
  firstOffer(now = new Date()): { radiusKm: number | null; at: Date } {
    return { radiusKm: firstRadius(this.config), at: now };
  }

  next(current: number | null): number | null {
    return nextRadius(this.config, current);
  }

  /** ¿Este repartidor ve la oferta con el radio dado? */
  canSee(order: OrderRecord, driver: Pick<DriverRecord, 'location'> | null, radiusKm = order.offerRadiusKm, now = new Date()): boolean {
    return canSeeOffer(this.config, radiusKm, order.business?.location ?? null, driver?.location ?? null, now);
  }

  /** ¿Toca ampliar la oferta? */
  waveDue(order: OrderRecord, now = new Date()): boolean {
    if (order.offerRadiusKm === null || !order.offerWaveAt) return false;
    return now.getTime() - order.offerWaveAt.getTime() >= this.config.waveMinutes * 60_000;
  }
}
