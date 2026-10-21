import { Inject, Injectable } from '@nestjs/common';
import { APP_ENV, type AppEnv } from '../../../config/env.validation';
import { splitDelivery, type DriverPayConfig } from '../../../kernel/driver-earnings';

/**
 * Cuánto gana el repartidor y los mínimos para depositarle, según las variables de entorno
 * (DRIVER_SHARE_PERCENT, DRIVER_MIN_AUTO_PAYOUT_SOLES, DRIVER_MIN_MANUAL_PAYOUT_SOLES).
 * Lo ya anotado en el libro de movimientos no cambia si después se cambia el porcentaje.
 */
@Injectable()
export class DriverPayPolicy {
  readonly config: DriverPayConfig;

  constructor(@Inject(APP_ENV) env: Pick<AppEnv, 'driverPay'>) {
    this.config = env.driverPay;
  }

  get sharePercent(): number {
    return this.config.sharePercent;
  }

  /** Comisión de Rapidito sobre la tarifa (el resto hasta 100 %). */
  get commissionPercent(): number {
    return Math.round((100 - this.config.sharePercent) * 100) / 100;
  }

  split(feeCents: number, tipCents: number) {
    return splitDelivery(feeCents, tipCents, this.config.sharePercent);
  }
}
