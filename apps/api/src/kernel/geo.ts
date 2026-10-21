import type { DriverVehicle, GeoPoint } from '@parla/types';
import { ValidationError } from './domain-error';

export const DRIVER_VEHICLES: readonly DriverVehicle[] = ['Moto', 'Bicicleta', 'Auto', 'A pie'];

/** Los vehículos con placa y licencia de conducir (en Perú: placa como B7K-482). */
const MOTORIZED: readonly DriverVehicle[] = ['Moto', 'Auto'];
const PLATE = /^[A-Z0-9]{2,4}-?[A-Z0-9]{2,4}$/;
/** DNI peruano: 8 dígitos. */
const DNI = /^\d{8}$/;
/** Licencia de conducir peruana: una letra y 8 dígitos (p. ej. Q12345678). */
const LICENSE = /^[A-Z]\d{8}$/;

/** Normaliza y valida el vehículo: conocido y con placa si es moto o auto. */
export function normalizeDriverProfile(vehicle: string, plate: string | undefined): { vehicle: DriverVehicle; plate: string } {
  if (!DRIVER_VEHICLES.includes(vehicle as DriverVehicle)) throw new ValidationError('Elige un vehículo: moto, bicicleta, auto o a pie');
  const v = vehicle as DriverVehicle;
  if (!MOTORIZED.includes(v)) return { vehicle: v, plate: '' };
  const p = (plate ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!PLATE.test(p)) throw new ValidationError('Escribe la placa del vehículo (p. ej. B7K-482)');
  return { vehicle: v, plate: p };
}

/** Documentos para la verificación: DNI siempre y licencia si maneja moto o auto. */
export function normalizeDriverDocuments(vehicle: DriverVehicle, dni: string | undefined, license: string | undefined): { dniNumber: string; licenseNumber: string | null } {
  const d = (dni ?? '').replace(/\D/g, '');
  if (!DNI.test(d)) throw new ValidationError('Escribe tu DNI (8 dígitos)');
  if (!MOTORIZED.includes(vehicle)) return { dniNumber: d, licenseNumber: null };
  const l = (license ?? '').trim().toUpperCase().replace(/[\s-]+/g, '');
  if (!LICENSE.test(l)) throw new ValidationError('Escribe tu licencia de conducir (una letra y 8 dígitos, p. ej. Q12345678)');
  return { dniNumber: d, licenseNumber: l };
}

/** Un punto válido en el mapa (grados decimales). */
export function assertPoint(point: GeoPoint): void {
  const ok = Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;
  if (!ok) throw new ValidationError('Ubicación inválida');
}

/** Distancia en línea recta entre dos puntos (km, fórmula del haversine). */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
