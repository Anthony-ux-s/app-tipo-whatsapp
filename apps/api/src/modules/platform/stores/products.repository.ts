import type { ImportProductsResult, StoreProduct } from '@parla/types';

export interface ReservationLine {
  sku: string;
  quantity: number;
}

/** Por qué no se pudo apartar el stock de un pedido. */
export type ReserveOutcome = { ok: true } | { ok: false; reason: 'OUT_OF_STOCK' | 'UNKNOWN_PRODUCT'; sku: string };

/** Catálogo propio de las tiendas (source = native) y el stock apartado de cada pedido. */
export interface ProductsRepository {
  /** `onlyActive`: lo que ve un cliente; el dueño ve también los inactivos. */
  list(businessId: string, opts: { query?: string; category?: string; onlyActive: boolean; limit: number }): Promise<StoreProduct[]>;
  find(businessId: string, sku: string): Promise<StoreProduct | null>;
  /** false si ya existía ese sku en la tienda. */
  create(businessId: string, product: StoreProduct): Promise<boolean>;
  /** null si el producto no existe. */
  update(businessId: string, sku: string, product: StoreProduct): Promise<StoreProduct | null>;
  delete(businessId: string, sku: string): Promise<boolean>;
  count(businessId: string): Promise<number>;
  /** Crea o actualiza por sku (importación masiva). Las filas ya vienen validadas. */
  upsertMany(businessId: string, products: StoreProduct[]): Promise<Pick<ImportProductsResult, 'created' | 'updated'>>;
  /** Cambio rápido de precio, oferta o stock (null en `listPriceCents` quita la oferta). */
  patch(businessId: string, sku: string, changes: { priceCents?: number; listPriceCents?: number | null; stock?: number }): Promise<StoreProduct | null>;

  /** Aparta el stock de un pedido: todo o nada, y repetirlo con la misma referencia no vuelve a descontar. */
  reserve(businessId: string, reference: string, lines: ReservationLine[]): Promise<ReserveOutcome>;
  /** Devuelve el stock apartado. Repetirlo no hace nada. */
  release(businessId: string, reference: string): Promise<boolean>;
}

export const PRODUCTS_REPOSITORY = Symbol('PRODUCTS_REPOSITORY');
