import type { DriverInfo } from '@parla/types';

/** Repartidor de Rapidito: una cuenta de Parla con su vehículo. */
export interface DriverRecord extends DriverInfo {
  userId: string;
}

export interface DriversRepository {
  findByUser(userId: string): Promise<DriverRecord | null>;
  /** Todos los repartidores, para ofrecerles un pedido listo para recoger. */
  listUserIds(): Promise<string[]>;
}

export const DRIVERS_REPOSITORY = Symbol('DRIVERS_REPOSITORY');
