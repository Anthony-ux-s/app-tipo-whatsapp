import type { Product } from '@parla/types';
import { Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import { formatSoles } from '@shared/utils/money';
import { discountPercent } from '../utils/services.utils';
import { ProductDetailSheet, type PoolEntry } from './ProductDetailSheet';
import { ProductImage } from './ProductImage';

interface ProductCardProps {
  product: Product;
  quantity: number;
  /** Nombre de la tienda (en Ofertas, donde hay productos de varias). */
  storeName?: string;
  /** La tienda del producto: con ella, tocar la tarjeta abre la ficha (galería, descripción y cantidad). */
  storeId?: string;
  /** Las presentaciones de este mismo producto (unidad, caja…) para elegir en la ficha. */
  variants?: Product[];
  /** Los demás productos a la vista, para recomendar en la ficha. */
  pool?: PoolEntry[];
  onAdd: () => void;
  onSubtract: () => void;
}

export function ProductCard({ product, quantity, storeName, storeId, variants, pool, onAdd, onSubtract }: ProductCardProps) {
  const [open, setOpen] = useState(false);
  const soldOut = product.stock === 0;
  const discount = discountPercent(product.priceCents, product.listPriceCents);
  return (
    <article data-testid="product" className="group flex flex-col gap-2 rounded-2xl bg-surface p-2.5 shadow-float">
      {open && storeId && <ProductDetailSheet product={product} variants={variants} pool={pool} storeId={storeId} storeName={storeName} onClose={() => setOpen(false)} />}
      {/* Recuadro de alto fijo: la foto lo llena entera (sin espacio sobrante) y todas las tarjetas miden igual. */}
      <div role={storeId ? "button" : undefined} tabIndex={storeId ? 0 : undefined} aria-label={storeId ? `Ver ${product.name}` : undefined} onClick={storeId ? () => setOpen(true) : undefined} onKeyDown={storeId ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setOpen(true)) : undefined} className={`relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-teal-50 to-cyan-50 text-teal-600 dark:from-teal-950/60 dark:to-cyan-950/60 dark:text-teal-300${storeId ? " cursor-pointer" : ""}`}>
        <ProductImage name={product.name} category={product.category} imageUrl={product.imageUrl} className="size-[72%] transition-transform duration-200 group-hover:scale-105" />
        {discount > 0 && (
          <span className="absolute top-2 left-2 rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-extrabold text-white">-{discount} %</span>
        )}
      </div>
      <div className="min-w-0 flex-1 px-0.5">
        {storeName && <p className="truncate text-[11px] font-semibold text-brand dark:text-teal-300">{storeName}</p>}
        <h3 className="line-clamp-2 text-sm leading-tight font-semibold text-ink">{storeId ? <button type="button" onClick={() => setOpen(true)} className="text-left hover:underline">{product.name}</button> : product.name}</h3>
        <p className="truncate text-xs text-ink-soft">{[product.category, product.unit].filter(Boolean).join(' · ')}</p>
        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
          <span className={`font-extrabold whitespace-nowrap ${discount > 0 ? 'text-rose-700 dark:text-rose-400' : 'text-ink'}`}>{formatSoles(product.priceCents)}</span>
          {discount > 0 && (
            <span className="text-xs whitespace-nowrap text-ink-faint line-through" aria-label={`Antes ${formatSoles(product.listPriceCents!)}`}>
              {formatSoles(product.listPriceCents!)}
            </span>
          )}
        </p>
      </div>
      <div className="flex h-9 items-center">
        {soldOut ? (
          <span className="w-full text-center text-xs font-semibold text-ink-faint">Agotado</span>
        ) : quantity === 0 ? (
          <button
            type="button"
            onClick={onAdd}
            aria-label={`Agregar ${product.name}`}
            className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-full bg-brand text-sm font-semibold text-white transition-colors duration-200 hover:bg-brand-strong active:scale-[0.98]"
          >
            <Plus className="size-4" /> Agregar
          </button>
        ) : (
          <span className="inline-flex w-full items-center justify-between rounded-full bg-teal-50 p-1 dark:bg-teal-950/60">
            <button type="button" onClick={onSubtract} aria-label={`Quitar un ${product.name}`} className="inline-flex size-7 items-center justify-center rounded-full text-brand hover:bg-white dark:text-teal-300 dark:hover:bg-teal-900">
              <Minus className="size-4" />
            </button>
            <span className="min-w-5 text-center text-sm font-bold text-ink" aria-label={`${quantity} en el carrito`}>
              {quantity}
            </span>
            <button
              type="button"
              onClick={onAdd}
              disabled={quantity >= product.stock}
              aria-label={`Agregar otro ${product.name}`}
              className="inline-flex size-7 items-center justify-center rounded-full text-brand hover:bg-white disabled:opacity-40 dark:text-teal-300 dark:hover:bg-teal-900"
            >
              <Plus className="size-4" />
            </button>
          </span>
        )}
      </div>
    </article>
  );
}
