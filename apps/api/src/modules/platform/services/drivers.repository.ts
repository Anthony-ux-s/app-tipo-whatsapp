import type { DriverStatus, DriverVehicle, GeoPoint } from '@parla/types';

/** Repartidor de Rapidito: una cuenta de Parla con su vehículo y su verificación. */
export interface DriverRecord {
  userId: string;
  vehicle: DriverVehicle;
  plate: string;
  online: boolean;
  /** false = dejó de repartir (su historial queda). */
  active: boolean;
  /** Verificación por soporte: solo los aprobados reparten. */
  status: DriverStatus;
  dniNumber: string | null;
  licenseNumber: string | null;
  documentPhotoId: string | null;
  reviewNote: string | null;
  /** Última ubicación que mandó su celular; null si nunca mandó. */
  location: (GeoPoint & { at: Date }) | null;
  /** Número de PagaYa donde se le depositan sus ganancias; null si no lo puso. */
  payoutPhone: string | null;
  createdAt: Date;
}

export interface DriverRegistration {
  vehicle: DriverVehicle;
  plate: string;
  dniNumber: string;
  licenseNumber: string | null;
}

export type DriverChanges = Partial<
  Pick<DriverRecord, 'vehicle' | 'plate' | 'online' | 'active' | 'payoutPhone' | 'documentPhotoId' | 'status' | 'reviewNote' | 'dniNumber' | 'licenseNumber'>
>;

export interface DriversRepository {
  findByUser(userId: string): Promise<DriverRecord | null>;
  /** Repartidores activos, aprobados y conectados (con su última ubicación, para las ofertas por cercanía). */
  listOnline(): Promise<DriverRecord[]>;
  /**
   * Alta (o vuelta, si había dejado de repartir): queda activo y desconectado. Si ya estaba aprobado,
   * sigue aprobado; si no, queda en revisión.
   */
  register(userId: string, registration: DriverRegistration): Promise<DriverRecord>;
  update(userId: string, changes: DriverChanges): Promise<DriverRecord>;
  saveLocation(userId: string, point: GeoPoint, at: Date): Promise<void>;
  /** Para soporte: repartidores activos en un estado de verificación, los más antiguos primero. */
  listByStatus(status: DriverStatus, limit: number): Promise<DriverRecord[]>;
}

export const DRIVERS_REPOSITORY = Symbol('DRIVERS_REPOSITORY');
