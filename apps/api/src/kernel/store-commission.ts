/**
 * Lo que Parla se queda de cada venta de una tienda (la tienda cobra por PagaYa a través de Parla): un porcentaje de
 * los productos, que se configura por categoría con `STORE_COMMISSION_<CATEGORÍA>` (p. ej. `STORE_COMMISSION_FERRETERIA=4`)
 * y, si no está, `STORE_COMMISSION_PERCENT` (5 por defecto). El delivery y la propina no entran: son del repartidor.
 */
const DEFAULT_PERCENT = 5;
const MAX_PERCENT = 50;

function percentFrom(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= MAX_PERCENT ? value : null;
}

export function storeCommissionPercent(service: string): number {
  return percentFrom(process.env[`STORE_COMMISSION_${service.toUpperCase()}`]) ?? percentFrom(process.env.STORE_COMMISSION_PERCENT) ?? DEFAULT_PERCENT;
}

/** De los productos vendidos: lo que se queda Parla y lo que le toca a la tienda. */
export function splitStoreSale(subtotalCents: number, percent: number): { commissionCents: number; netCents: number } {
  const commissionCents = Math.round((subtotalCents * percent) / 100);
  return { commissionCents, netCents: subtotalCents - commissionCents };
}
