import type { BusinessInfo, ServiceId, UpdateBusinessRequest } from '@parla/types';

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
  /** El dueño pausa o reanuda los pedidos, o cambia el horario. */
  update(id: string, changes: UpdateBusinessRequest): Promise<BusinessRecord>;
}

export const BUSINESSES_REPOSITORY = Symbol('BUSINESSES_REPOSITORY');
