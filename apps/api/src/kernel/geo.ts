import type { DriverVehicle, GeoPoint } from '@parla/types';
import { ValidationError } from './domain-error';

export const DRIVER_VEHICLES: readonly DriverVehicle[] = ['Moto', 'Bicicleta', 'Auto', 'A pie'];

/** Los vehículos con placa (en Perú: letras y números, p. ej. B7K-482). */
const NEEDS_PLATE: readonly DriverVehicle[] = ['Moto', 'Auto'];
const PLATE = /^[A-Z0-9]{2,4}-?[A-Z0-9]{2,4}$/;

/** Normaliza y valida el perfil del repartidor: vehículo conocido y placa si la necesita. */
export function normalizeDriverProfile(vehicle: string, plate: string | undefined): { vehicle: DriverVehicle; plate: string } {
  if (!DRIVER_VEHICLES.includes(vehicle as DriverVehicle)) throw new ValidationError('Elige un vehículo: moto, bicicleta, auto o a pie');
  const v = vehicle as DriverVehicle;
  if (!NEEDS_PLATE.includes(v)) return { vehicle: v, plate: '' };
  const p = (plate ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!PLATE.test(p)) throw new ValidationError('Escribe la placa del vehículo (p. ej. B7K-482)');
  return { vehicle: v, plate: p };
}

/** Un punto válido en el mapa (grados decimales). */
export function assertPoint(point: GeoPoint): void {
  const ok = Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;
  if (!ok) throw new ValidationError('Ubicación inválida');
}
