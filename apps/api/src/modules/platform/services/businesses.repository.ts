import type { BusinessInfo, ServiceId } from '@parla/types';

/** Negocio tal como lo ven los casos de uso: atiende un servicio y tiene un dueño en Parla. */
export interface BusinessRecord extends BusinessInfo {
  ownerId: string;
  /** Dónde recoge el repartidor. */
  address: string;
}

export interface BusinessesRepository {
  /** Negocio que atiende los pedidos de un servicio (hoy, uno por servicio). */
  findByService(service: ServiceId): Promise<BusinessRecord | null>;
  findByOwner(ownerId: string): Promise<BusinessRecord | null>;
}

export const BUSINESSES_REPOSITORY = Symbol('BUSINESSES_REPOSITORY');
