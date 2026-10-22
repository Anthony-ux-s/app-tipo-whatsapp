import { Inject, Injectable } from '@nestjs/common';
import type { StoreProduct } from '@parla/types';
import { NotFoundError, ValidationError } from '../../../kernel/domain-error';
import { MAX_PRICE_CENTS, MAX_STOCK } from '../../../kernel/store-rules';
import { BUSINESSES_REPOSITORY, type BusinessesRepository } from '../services/businesses.repository';
import { PRODUCTS_REPOSITORY, type ProductsRepository, type ReservationLine, type ReserveOutcome } from './products.repository';

const SEARCH_LIMIT = 500;

export interface ProductChanges {
  priceCents?: number;
  /** null quita la oferta. */
  listPriceCents?: number | null;
  stock?: number;
}

/**
 * La «API de tienda de Parla» (catálogo, producto, reserva y anulación) servida por el propio core para
 * las tiendas que usan el catálogo de Parla. El gateway la consume igual que la API de cualquier tienda
 * externa: así todas las tiendas comparten el mismo flujo de pedidos, reservas y pagos.
 */
@Injectable()
export class StoreApiUseCase {
  constructor(
    @Inject(BUSINESSES_REPOSITORY) private readonly businesses: BusinessesRepository,
    @Inject(PRODUCTS_REPOSITORY) private readonly products: ProductsRepository,
  ) {}

  /** La tienda debe existir, estar aprobada y usar el catálogo de Parla. */
  private async store(id: string, opts: { needApproved: boolean }) {
    const business = await this.businesses.findById(id);
    if (!business || business.source !== 'native' || (opts.needApproved && business.status !== 'approved')) throw new NotFoundError('Tienda no encontrada');
    return business;
  }

  async search(storeId: string, query: string): Promise<StoreProduct[]> {
    const business = await this.store(storeId, { needApproved: true });
    return this.products.list(business.id, { query, onlyActive: true, limit: SEARCH_LIMIT });
  }

  async product(storeId: string, sku: string): Promise<StoreProduct> {
    const business = await this.store(storeId, { needApproved: true });
    const product = await this.products.find(business.id, sku);
    if (!product || !product.active) throw new NotFoundError('Producto no encontrado');
    return product;
  }

  /** Cambio rápido de precio, oferta o stock (lo hace el dueño desde su pantalla de catálogo). */
  async patch(storeId: string, sku: string, changes: ProductChanges): Promise<StoreProduct> {
    const business = await this.store(storeId, { needApproved: false });
    const valid =
      (changes.priceCents === undefined || (Number.isInteger(changes.priceCents) && changes.priceCents >= 1 && changes.priceCents <= MAX_PRICE_CENTS)) &&
      (changes.stock === undefined || (Number.isInteger(changes.stock) && changes.stock >= 0 && changes.stock <= MAX_STOCK)) &&
      (changes.listPriceCents == null || (Number.isInteger(changes.listPriceCents) && changes.listPriceCents <= MAX_PRICE_CENTS));
    if (!valid) throw new ValidationError('Precio, oferta o stock fuera de rango');
    const saved = await this.products.patch(business.id, sku, changes);
    if (!saved) throw new NotFoundError('Producto no encontrado');
    return saved;
  }

  async reserve(storeId: string, reference: string, lines: ReservationLine[]): Promise<ReserveOutcome> {
    const business = await this.store(storeId, { needApproved: true });
    return this.products.reserve(business.id, reference, lines);
  }

  /** Anular una reserva siempre se puede, aunque la tienda se haya suspendido mientras tanto. */
  async release(storeId: string, reference: string): Promise<boolean> {
    const business = await this.store(storeId, { needApproved: false });
    return this.products.release(business.id, reference);
  }
}
