import type { Product } from '@parla/types';
import { Minus, Package, Plus } from 'lucide-react';
import { formatSoles } from '@shared/utils/money';

interface ProductCardProps {
  product: Product;
  quantity: number;
  onAdd: () => void;
  onSubtract: () => void;
}

export function ProductCard({ product, quantity, onAdd, onSubtract }: ProductCardProps) {
  const soldOut = product.stock === 0;
  return (
    <article data-testid="product" className="flex flex-col gap-3 rounded-2xl bg-surface p-3 shadow-float">
      <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-gradient-to-br from-teal-50 to-cyan-50 text-teal-600 dark:from-teal-950/60 dark:to-cyan-950/60 dark:text-teal-300">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt="" className="size-full rounded-xl object-cover" loading="lazy" />
        ) : (
          <Package className="size-10" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 text-sm font-semibold text-ink">{product.name}</h3>
        <p className="text-xs text-ink-soft">{product.unit}</p>
        <p className="mt-1 font-extrabold whitespace-nowrap text-ink">{formatSoles(product.priceCents)}</p>
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
