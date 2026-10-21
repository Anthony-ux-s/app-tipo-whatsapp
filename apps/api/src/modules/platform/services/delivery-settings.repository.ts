import type { DeliveryPricing } from '@parla/types';

export interface StoredDeliverySettings {
  pricing: DeliveryPricing;
  updatedAt: Date | null;
  updatedById: string | null;
}

/** La tarifa del delivery que configura soporte (con los valores por defecto si nunca la cambió). */
export interface DeliverySettingsRepository {
  get(): Promise<StoredDeliverySettings>;
  save(pricing: DeliveryPricing, adminId: string): Promise<StoredDeliverySettings>;
}

export const DELIVERY_SETTINGS_REPOSITORY = Symbol('DELIVERY_SETTINGS_REPOSITORY');
