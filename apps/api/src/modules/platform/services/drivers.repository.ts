import type { DriverInfo, DriverProfileRequest, GeoPoint } from '@parla/types';

/** Repartidor de Rapidito: una cuenta de Parla con su vehículo. */
export interface DriverRecord extends DriverInfo {
  userId: string;
  /** false = dejó de repartir (su historial queda). */
  active: boolean;
  /** Última ubicación que mandó su celular; null si nunca mandó. */
  location: (GeoPoint & { at: Date }) | null;
}

export interface DriversRepository {
  findByUser(userId: string): Promise<DriverRecord | null>;
  /** Repartidores activos y conectados, para ofrecerles un pedido listo para recoger. */
  listUserIds(): Promise<string[]>;
  /** Alta (o vuelta, si había dejado de repartir): queda activo y desconectado. */
  register(userId: string, profile: Required<DriverProfileRequest>): Promise<DriverRecord>;
  update(userId: string, changes: Partial<Pick<DriverRecord, 'vehicle' | 'plate' | 'online' | 'active'>>): Promise<DriverRecord>;
  saveLocation(userId: string, point: GeoPoint, at: Date): Promise<void>;
}

export const DRIVERS_REPOSITORY = Symbol('DRIVERS_REPOSITORY');
