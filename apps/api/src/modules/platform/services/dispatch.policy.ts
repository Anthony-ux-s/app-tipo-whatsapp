import { Inject, Injectable, Optional } from '@nestjs/common';
import { APP_ENV, type AppEnv } from '../../../config/env.validation';
import { canSeeOffer, firstRadius, nextRadius, type DispatchConfig } from '../../../kernel/dispatch';
import { DELIVERY_SETTINGS_REPOSITORY, type DeliverySettingsRepository } from './delivery-settings.repository';
import type { DriverRecord } from './drivers.repository';
import type { OfferReservation, OrderChanges, OrderRecord } from './orders.repository';

/**
 * En asignación óptima, cuánto se retiene un pedido recién listo (nadie lo ve) mientras el
 * despachador decide a quién dárselo. Si el despachador no corre, al vencer se ofrece por oleadas.
 */
export const ASSIGNMENT_HOLD_MS = 15_000;

/**
 * Ofertas: a quién se le muestra un pedido listo. Por oleadas (DISPATCH_RADII_KM y
 * DISPATCH_WAVE_MINUTES) o, en asignación óptima, primero solo al repartidor elegido.
 */
@Injectable()
export class DispatchPolicy {
  readonly config: DispatchConfig;

  constructor(
    @Inject(APP_ENV) env: Pick<AppEnv, 'dispatch'>,
    /** Sin la tarifa de soporte (p. ej. en pruebas), siempre por oleadas. */
    @Optional() @Inject(DELIVERY_SETTINGS_REPOSITORY) private readonly settings?: DeliverySettingsRepository,
  ) {
    this.config = env.dispatch;
  }

  /** La primera oleada de un pedido que queda listo (o vuelve a ofrecerse). */
  firstOffer(now = new Date()): { radiusKm: number | null; at: Date } {
    return { radiusKm: firstRadius(this.config), at: now };
  }

  /**
   * Lo que se guarda cuando un pedido queda listo (o vuelve a ofrecerse): la primera oleada y, en
   * asignación óptima, la retención mientras se elige el repartidor.
   */
  async openOffer(now = new Date()): Promise<Pick<OrderChanges, 'offer' | 'reservation'>> {
    const optimal = (await this.settings?.get())?.pricing.dispatchMode === 'optimal';
    const reservation: OfferReservation | null = optimal ? { driverId: null, until: new Date(now.getTime() + ASSIGNMENT_HOLD_MS) } : null;
    return { offer: this.firstOffer(now), reservation };
  }

  next(current: number | null): number | null {
    return nextRadius(this.config, current);
  }

  /**
   * ¿Este repartidor ve la oferta? Si está reservada (y vigente), solo su repartidor; si está
   * retenida, nadie; si no, según la oleada por cercanía.
   */
  canSee(order: OrderRecord, driver: Pick<DriverRecord, 'location' | 'userId'> | null, radiusKm = order.offerRadiusKm, now = new Date()): boolean {
    const reserved = order.reservedFor;
    if (reserved && reserved.until.getTime() > now.getTime()) return !!driver && reserved.driverId === driver.userId;
    return canSeeOffer(this.config, radiusKm, order.business?.location ?? null, driver?.location ?? null, now);
  }

  /** ¿Toca ampliar la oferta? (No mientras esté reservada para alguien.) */
  waveDue(order: OrderRecord, now = new Date()): boolean {
    if (order.offerRadiusKm === null || !order.offerWaveAt) return false;
    if (order.reservedFor && order.reservedFor.until.getTime() > now.getTime()) return false;
    return now.getTime() - order.offerWaveAt.getTime() >= this.config.waveMinutes * 60_000;
  }
}
