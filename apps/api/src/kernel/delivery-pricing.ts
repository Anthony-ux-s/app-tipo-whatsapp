import type { DeliveryPricing, DeliveryQuoteBreakdown, DistanceMethod, DriverVehicle, GeoPoint } from '@parla/types';
import { ValidationError } from './domain-error';
import { DRIVER_VEHICLES } from './geo';

/**
 * Tarifa por defecto (Lima, 2026): S/ 3.00 + S/ 0.60 por km + combustible de una moto (110 km por
 * galón, S/ 17 el galón, +60 % por desgaste), entre S/ 4 y S/ 25; hasta 3 pedidos por viaje.
 * Soporte la cambia en su panel.
 */
export const DEFAULT_DELIVERY_PRICING: DeliveryPricing = {
  baseFeeCents: 300,
  perKmCents: 60,
  minFeeCents: 400,
  maxFeeCents: 2500,
  flatFeeCents: 650,
  fuelPriceCentsPerGallon: 1700,
  fuelMarginPercent: 60,
  kmPerGallon: { Moto: 110, Auto: 40, Bicicleta: 0, 'A pie': 0 },
  avgSpeedKmh: { Moto: 24, Auto: 20, Bicicleta: 14, 'A pie': 5 },
  pricingVehicle: 'Moto',
  useStreetRouting: true,
  streetFactor: 1.35,
  handlingMinutes: 10,
  maxActiveOrders: 3,
  dispatchMode: 'optimal',
  exclusiveOfferSeconds: 45,
};

const MAX_FEE_CENTS = 10_000;

function assertRange(value: number, min: number, max: number, message: string): void {
  if (!Number.isFinite(value) || value < min || value > max) throw new ValidationError(message);
}

/** Valida una tarifa antes de guardarla (montos en céntimos, sin valores absurdos). */
export function assertDeliveryPricing(p: DeliveryPricing): void {
  assertRange(p.baseFeeCents, 0, MAX_FEE_CENTS, 'La tarifa base debe estar entre S/ 0 y S/ 100');
  assertRange(p.perKmCents, 0, 2_000, 'El precio por km debe estar entre S/ 0 y S/ 20');
  assertRange(p.minFeeCents, 0, MAX_FEE_CENTS, 'El mínimo debe estar entre S/ 0 y S/ 100');
  assertRange(p.maxFeeCents, 100, MAX_FEE_CENTS, 'El máximo debe estar entre S/ 1 y S/ 100');
  if (p.minFeeCents > p.maxFeeCents) throw new ValidationError('El mínimo no puede ser mayor que el máximo');
  assertRange(p.flatFeeCents, 100, MAX_FEE_CENTS, 'La tarifa plana debe estar entre S/ 1 y S/ 100');
  assertRange(p.fuelPriceCentsPerGallon, 0, 10_000, 'El galón debe costar entre S/ 0 y S/ 100');
  assertRange(p.fuelMarginPercent, 0, 500, 'El margen del combustible debe estar entre 0 % y 500 %');
  assertRange(p.streetFactor, 1, 3, 'El factor de calles debe estar entre 1 y 3');
  assertRange(p.handlingMinutes, 0, 120, 'Los minutos fijos deben estar entre 0 y 120');
  if (p.dispatchMode !== 'optimal' && p.dispatchMode !== 'waves') throw new ValidationError('Elige cómo se reparten los pedidos');
  assertRange(p.exclusiveOfferSeconds, 15, 300, 'La oferta exclusiva debe durar entre 15 y 300 segundos');
  if (!Number.isInteger(p.maxActiveOrders) || p.maxActiveOrders < 1 || p.maxActiveOrders > 5) throw new ValidationError('Un repartidor puede llevar de 1 a 5 pedidos a la vez');
  if (!DRIVER_VEHICLES.includes(p.pricingVehicle)) throw new ValidationError('Elige un vehículo para cotizar');
  for (const v of DRIVER_VEHICLES) {
    assertRange(p.kmPerGallon[v], 0, 500, `El rendimiento de «${v}» debe estar entre 0 y 500 km por galón`);
    assertRange(p.avgSpeedKmh[v], 1, 120, `La velocidad de «${v}» debe estar entre 1 y 120 km/h`);
  }
}

/** Completa una tarifa guardada con los valores por defecto (por si se agregan campos nuevos). */
export function withPricingDefaults(saved: Partial<DeliveryPricing> | null): DeliveryPricing {
  return {
    ...DEFAULT_DELIVERY_PRICING,
    ...saved,
    kmPerGallon: { ...DEFAULT_DELIVERY_PRICING.kmPerGallon, ...saved?.kmPerGallon },
    avgSpeedKmh: { ...DEFAULT_DELIVERY_PRICING.avgSpeedKmh, ...saved?.avgSpeedKmh },
  };
}

/** Galones que gasta un vehículo en `km` (0 si no usa combustible). */
export function fuelGallons(p: DeliveryPricing, vehicle: DriverVehicle, km: number): number {
  const rendimiento = p.kmPerGallon[vehicle];
  return rendimiento > 0 ? km / rendimiento : 0;
}

/** Costo del combustible de un recorrido, con el margen por desgaste (céntimos). */
export function fuelCostCents(p: DeliveryPricing, vehicle: DriverVehicle, km: number): number {
  return Math.round(fuelGallons(p, vehicle, km) * p.fuelPriceCentsPerGallon * (1 + p.fuelMarginPercent / 100));
}

/** Minutos estimados: los fijos (recoger y entregar) + el recorrido a la velocidad promedio. */
export function travelMinutes(p: DeliveryPricing, vehicle: DriverVehicle, km: number): number {
  return Math.max(1, Math.round(p.handlingMinutes + (km / p.avgSpeedKmh[vehicle]) * 60));
}

export interface PriceInput {
  /** Km del recorrido (por las calles o estimados); null = sin ubicaciones: tarifa plana. */
  distanceKm: number | null;
  straightLineKm?: number;
  method: DistanceMethod;
  /** Minutos por las calles (del servicio de rutas); si no, se estiman con la velocidad promedio. */
  streetMinutes?: number | null;
  vehicle?: DriverVehicle;
  path?: GeoPoint[] | null;
}

/**
 * Cotiza el delivery: base + km × precio por km + combustible (con margen), redondeado a 10
 * céntimos y entre el mínimo y el máximo. Sin distancia, la tarifa plana.
 */
export function priceDelivery(p: DeliveryPricing, input: PriceInput): DeliveryQuoteBreakdown {
  const vehicle = input.vehicle ?? p.pricingVehicle;
  if (input.distanceKm === null) {
    return {
      feeCents: p.flatFeeCents,
      baseCents: p.flatFeeCents,
      distanceCents: 0,
      fuelCents: 0,
      fuelGallons: 0,
      distanceKm: 0,
      straightLineKm: 0,
      etaMinutes: 30,
      method: 'flat',
      vehicle,
      path: null,
    };
  }
  const km = Math.max(0, input.distanceKm);
  const distanceCents = Math.round(p.perKmCents * km);
  const fuelCents = fuelCostCents(p, vehicle, km);
  const raw = p.baseFeeCents + distanceCents + fuelCents;
  const feeCents = Math.max(p.minFeeCents, Math.min(p.maxFeeCents, Math.round(raw / 10) * 10));
  const estimated = travelMinutes(p, vehicle, km);
  // OSRM calcula para auto sin tráfico: se toma lo más lento entre su tiempo (+30 %) y la velocidad promedio.
  const etaMinutes = input.streetMinutes ? Math.max(estimated, Math.round(p.handlingMinutes + input.streetMinutes * 1.3)) : estimated;
  return {
    feeCents,
    baseCents: p.baseFeeCents,
    distanceCents,
    fuelCents,
    fuelGallons: Math.round(fuelGallons(p, vehicle, km) * 1000) / 1000,
    distanceKm: Math.round(km * 100) / 100,
    straightLineKm: Math.round((input.straightLineKm ?? km) * 100) / 100,
    etaMinutes,
    method: input.method,
    vehicle,
    path: input.path ?? null,
  };
}
