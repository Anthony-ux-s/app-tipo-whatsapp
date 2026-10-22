import { Injectable } from '@nestjs/common';
import type { StoreProduct } from '@parla/types';
import { Prisma, type Product as ProductRow } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import type { ProductsRepository, ReservationLine, ReserveOutcome } from './products.repository';

function toProduct(row: ProductRow): StoreProduct {
  return {
    sku: row.sku,
    name: row.name,
    unit: row.unit,
    priceCents: row.priceCents,
    listPriceCents: row.listPriceCents,
    stock: row.stock,
    category: row.category,
    imageUrl: row.imageUrl,
    active: row.active,
  };
}

const data = (p: StoreProduct) => ({ name: p.name, unit: p.unit, priceCents: p.priceCents, listPriceCents: p.listPriceCents, stock: p.stock, category: p.category, imageUrl: p.imageUrl, active: p.active });

/** Corta la transacción con el motivo, para que no se descuente nada de un pedido a medias. */
class ReserveFailure extends Error {
  constructor(readonly outcome: Extract<ReserveOutcome, { ok: false }>) {
    super(outcome.reason);
  }
}

@Injectable()
export class PrismaProductsRepository implements ProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(businessId: string, opts: { query?: string; category?: string; onlyActive: boolean; limit: number }): Promise<StoreProduct[]> {
    const q = opts.query?.trim();
    const rows = await this.prisma.product.findMany({
      where: {
        businessId,
        ...(opts.onlyActive ? { active: true } : {}),
        ...(opts.category ? { category: opts.category } : {}),
        ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { category: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }] } : {}),
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      take: opts.limit,
    });
    return rows.map(toProduct);
  }

  async find(businessId: string, sku: string): Promise<StoreProduct | null> {
    const row = await this.prisma.product.findUnique({ where: { businessId_sku: { businessId, sku } } });
    return row ? toProduct(row) : null;
  }

  async create(businessId: string, product: StoreProduct): Promise<boolean> {
    try {
      await this.prisma.product.create({ data: { businessId, sku: product.sku, ...data(product) } });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false;
      throw error;
    }
  }

  async update(businessId: string, sku: string, product: StoreProduct): Promise<StoreProduct | null> {
    const { count } = await this.prisma.product.updateMany({ where: { businessId, sku }, data: data(product) });
    return count ? this.find(businessId, sku) : null;
  }

  async delete(businessId: string, sku: string): Promise<boolean> {
    const { count } = await this.prisma.product.deleteMany({ where: { businessId, sku } });
    return count > 0;
  }

  count(businessId: string): Promise<number> {
    return this.prisma.product.count({ where: { businessId } });
  }

  async upsertMany(businessId: string, products: StoreProduct[]): Promise<{ created: number; updated: number }> {
    const existing = new Set((await this.prisma.product.findMany({ where: { businessId, sku: { in: products.map((p) => p.sku) } }, select: { sku: true } })).map((r) => r.sku));
    await this.prisma.$transaction(
      products.map((p) =>
        this.prisma.product.upsert({ where: { businessId_sku: { businessId, sku: p.sku } }, create: { businessId, sku: p.sku, ...data(p) }, update: data(p) }),
      ),
    );
    const updated = products.filter((p) => existing.has(p.sku)).length;
    return { created: products.length - updated, updated };
  }

  async patch(businessId: string, sku: string, changes: { priceCents?: number; listPriceCents?: number | null; stock?: number }): Promise<StoreProduct | null> {
    const { count } = await this.prisma.product.updateMany({ where: { businessId, sku }, data: changes });
    return count ? this.find(businessId, sku) : null;
  }

  async reserve(businessId: string, reference: string, lines: ReservationLine[]): Promise<ReserveOutcome> {
    // Una misma referencia repetida no vuelve a descontar; las líneas repetidas del mismo producto se suman.
    const merged = [...lines.reduce((map, l) => map.set(l.sku, (map.get(l.sku) ?? 0) + l.quantity), new Map<string, number>())].map(([sku, quantity]) => ({ sku, quantity }));
    try {
      return await this.prisma.$transaction(async (tx) => {
        const key = { businessId_reference: { businessId, reference } };
        const existing = await tx.stockReservation.findUnique({ where: key });
        if (existing && !existing.released) return { ok: true } as const;
        for (const line of merged) {
          // Descuenta solo si alcanza: así dos pedidos a la vez nunca dejan el stock en negativo.
          const { count } = await tx.product.updateMany({ where: { businessId, sku: line.sku, active: true, stock: { gte: line.quantity } }, data: { stock: { decrement: line.quantity } } });
          if (count === 0) {
            const product = await tx.product.findFirst({ where: { businessId, sku: line.sku, active: true }, select: { id: true } });
            throw new ReserveFailure({ ok: false, reason: product ? 'OUT_OF_STOCK' : 'UNKNOWN_PRODUCT', sku: line.sku });
          }
        }
        const stored = JSON.stringify(merged);
        await tx.stockReservation.upsert({ where: key, create: { businessId, reference, lines: stored }, update: { lines: stored, released: false } });
        return { ok: true } as const;
      });
    } catch (error) {
      if (error instanceof ReserveFailure) return error.outcome;
      throw error;
    }
  }

  async release(businessId: string, reference: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const found = await tx.stockReservation.findUnique({ where: { businessId_reference: { businessId, reference } } });
      if (!found || found.released) return false;
      for (const line of JSON.parse(found.lines) as ReservationLine[]) {
        await tx.product.updateMany({ where: { businessId, sku: line.sku }, data: { stock: { increment: line.quantity } } });
      }
      await tx.stockReservation.update({ where: { businessId_reference: { businessId, reference } }, data: { released: true } });
      return true;
    });
  }
}
