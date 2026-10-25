import { parsePhone } from './phone';
import type { GeoPoint, RegisterStoreRequest, ServiceId, StoreProduct } from '@parla/types';
import { assertHour } from './business-hours';
import { ValidationError } from './domain-error';

export const SERVICE_IDS: ServiceId[] = ['mercado', 'tecnologia', 'ferreteria', 'salud'];

/** Lo mismo que acepta el gateway: más que esto por unidad es un error del proveedor (S/ 10 000). */
export const MAX_PRICE_CENTS = 1_000_000;
export const MAX_STOCK = 1_000_000;
/** Filas por importación (el navegador manda el archivo en lotes). */
export const MAX_IMPORT_ROWS = 200;

const SKU = /^[A-Za-z0-9_-]{1,64}$/;

export function assertLocation(location: GeoPoint | null | undefined): void {
  if (!location) return;
  const { lat, lng } = location;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) throw new ValidationError('La ubicación de la tienda no es válida');
}

/** Datos para abrir una tienda: nombre, categoría, dirección y horario razonables. */
export function assertStoreRegistration(input: RegisterStoreRequest): void {
  const name = input.name?.trim() ?? '';
  if (name.length < 3 || name.length > 60) throw new ValidationError('El nombre de la tienda lleva de 3 a 60 letras');
  if (!SERVICE_IDS.includes(input.service)) throw new ValidationError('Elige la categoría de tu tienda');
  if ((input.description ?? '').length > 300) throw new ValidationError('La descripción lleva hasta 300 letras');
  const address = input.address?.trim() ?? '';
  if (address.length < 6 || address.length > 200) throw new ValidationError('Escribe la dirección de la tienda (donde el repartidor recoge los pedidos)');
  assertLocation(input.location);
  parsePhone(input.phone ?? '');
  if (input.opensAt !== undefined) assertHour(input.opensAt, 'Abre');
  if (input.closesAt !== undefined) assertHour(input.closesAt, 'Cierra');
}

/** Normaliza un producto (recorta textos, vacía lo opcional) y lo valida. Devuelve el producto limpio. */
export function cleanProduct(p: StoreProduct): StoreProduct {
  const product: StoreProduct = {
    sku: String(p.sku ?? '').trim(),
    name: String(p.name ?? '').trim(),
    unit: String(p.unit ?? '').trim(),
    priceCents: p.priceCents,
    listPriceCents: p.listPriceCents ?? null,
    stock: p.stock,
    category: String(p.category ?? '').trim().toLowerCase(),
    imageUrl: p.imageUrl ? String(p.imageUrl).trim() : null,
    active: p.active !== false,
  };
  if (!SKU.test(product.sku)) throw new ValidationError('El código (sku) lleva de 1 a 64 letras, números, «-» o «_», sin espacios');
  if (!product.name || product.name.length > 120) throw new ValidationError('El nombre del producto lleva de 1 a 120 letras');
  if (product.unit.length > 40) throw new ValidationError('La presentación lleva hasta 40 letras');
  if (!Number.isInteger(product.priceCents) || product.priceCents < 1 || product.priceCents > MAX_PRICE_CENTS) throw new ValidationError('El precio debe estar entre S/ 0.01 y S/ 10 000');
  if (product.listPriceCents !== null) {
    if (!Number.isInteger(product.listPriceCents) || product.listPriceCents > MAX_PRICE_CENTS) throw new ValidationError('El precio de antes no es válido');
    if (product.listPriceCents <= product.priceCents) product.listPriceCents = null;
  }
  if (!Number.isInteger(product.stock) || product.stock < 0 || product.stock > MAX_STOCK) throw new ValidationError('El stock va de 0 a 1 000 000');
  if (product.category.length > 40) throw new ValidationError('La categoría lleva hasta 40 letras');
  if (product.imageUrl !== null) {
    let url: URL | null = null;
    try {
      url = new URL(product.imageUrl);
    } catch {
      url = null;
    }
    if (!url || url.protocol !== 'https:' || product.imageUrl.length > 500) throw new ValidationError('La foto debe ser un enlace https://');
  }
  return product;
}
