import type { Product } from '@parla/types';
import { ChevronLeft, ChevronRight, ImageOff, Minus, Plus, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { useCartStore } from '@shared/stores/cart.store';
import { formatSoles } from '@shared/utils/money';
import { discountPercent, variantsOf } from '../utils/services.utils';
import { ProductImage } from './ProductImage';

/** Cuántos pasos de arrastre cuentan como «deslizar» (en píxeles). */
const SWIPE_PX = 40;

/** Un producto con la tienda que lo vende (para recomendar productos de cualquier tienda). */
export interface PoolEntry {
  product: Product;
  storeId: string;
  storeName?: string;
}

/** Cuántos productos recomendados se muestran. */
const MAX_RELATED = 12;

export interface ProductDetailProps {
  product: Product;
  /** Las presentaciones de este mismo producto (unidad, caja, rollo…), incluido él; con una sola no hay selector. */
  variants?: Product[];
  storeId: string;
  storeName?: string;
  /** Los demás productos a la vista: de ahí salen los recomendados («Más productos»). */
  pool?: PoolEntry[];
  onClose: () => void;
}

/** Las fotos de la ficha: `images` si la tienda las mandó; si no, la foto principal. */
export function productPhotos(product: Product): string[] {
  const list = product.images && product.images.length > 0 ? product.images : product.imageUrl ? [product.imageUrl] : [];
  return list.slice(0, 4);
}

/**
 * La ficha del producto: galería (deslizar, flechas, miniaturas, zoom), descripción, precio, presentación y
 * cantidad. En el celular sube desde abajo; en escritorio es una ventana centrada.
 */
export function ProductDetailSheet({ product: first, variants: firstVariants, storeId: firstStoreId, storeName: firstStoreName, pool = [], onClose }: ProductDetailProps) {
  // Tocar un recomendado cambia la ficha a ese producto (como en Temu), sin cerrarla.
  const [entry, setEntry] = useState<PoolEntry>({ product: first, storeId: firstStoreId, storeName: firstStoreName });
  const { storeId, storeName } = entry;
  const initial = entry.product;
  const options = useMemo(() => {
    const sameStore = pool.filter((e) => e.storeId === storeId).map((e) => e.product);
    const found = sameStore.length > 0 ? variantsOf(initial, sameStore) : (firstVariants ?? [initial]);
    return found.length > 1 ? found : [initial];
  }, [pool, storeId, initial, firstVariants]);
  const [selectedId, setSelectedId] = useState(first.id);
  const scrollRef = useRef<HTMLDivElement>(null);
  const related = useMemo(() => {
    const own = new Set(options.map((o) => o.id));
    return pool
      .filter((e) => !(e.storeId === storeId && own.has(e.product.id)))
      // Primero lo de la misma categoría, luego lo de la misma tienda y lo más rebajado.
      .map((e) => ({ e, score: (e.product.category === initial.category ? 4 : 0) + (e.storeId === storeId ? 2 : 0) + (discountPercent(e.product.priceCents, e.product.listPriceCents) > 0 ? 1 : 0) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RELATED)
      .map((x) => x.e);
  }, [pool, options, storeId, initial.category]);
  const openRelated = (e: PoolEntry) => {
    setEntry(e);
    setSelectedId(e.product.id);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const product = options.find((o) => o.id === selectedId) ?? initial;
  const photos = useMemo(() => productPhotos(product), [product]);
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [quantity, setQuantity] = useState(1);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ x: number; moved: boolean } | null>(null);

  const change = useCartStore((s) => s.change);
  const inCart = useCartStore((s) => (s.service === storeId ? (s.items[product.id]?.quantity ?? 0) : 0));
  const room = Math.max(0, product.stock - inCart);
  const soldOut = product.stock === 0;
  const discount = discountPercent(product.priceCents, product.listPriceCents);
  const total = product.priceCents * quantity;

  // Al cambiar de presentación se vuelve a la primera foto y a 1 unidad.
  useEffect(() => {
    setIndex(0);
    setZoomed(false);
    setQuantity(1);
  }, [selectedId, storeId]);

  const go = useCallback(
    (delta: number) => {
      if (photos.length < 2) return;
      setZoomed(false);
      setIndex((i) => (i + delta + photos.length) % photos.length);
    },
    [photos.length],
  );

  // Precarga la siguiente foto.
  useEffect(() => {
    if (photos.length < 2) return;
    const next = photos[(index + 1) % photos.length];
    if (next) new Image().src = next;
  }, [index, photos]);

  // Foco: entra al cerrar-botón y vuelve a lo que estaba al salir; el fondo no se desplaza.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    } else if (event.key === 'ArrowLeft') go(-1);
    else if (event.key === 'ArrowRight') go(1);
    else if (event.key === 'Tab') {
      // Foco atrapado: Tab da la vuelta dentro de la ficha.
      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])');
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  const onPointerDown = (event: PointerEvent) => {
    drag.current = { x: event.clientX, moved: false };
  };
  const onPointerUp = (event: PointerEvent) => {
    const start = drag.current;
    drag.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    if (Math.abs(dx) >= SWIPE_PX && !zoomed) go(dx < 0 ? 1 : -1);
    else if (Math.abs(dx) < 8 && photos.length > 0) setZoomed((z) => !z);
  };

  const photo = photos[index];
  const photoBroken = photo ? failed.has(photo) : false;
  const markFailed = (src: string) => setFailed((prev) => new Set(prev).add(src));

  const add = () => {
    if (soldOut || room === 0) return;
    change(product, Math.min(quantity, room), storeId);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 animate-fade-in bg-teal-950/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={product.name}
        data-testid="product-detail"
        className="relative flex max-h-[94dvh] w-full animate-rise flex-col overflow-hidden rounded-t-2xl bg-surface shadow-pop sm:max-h-[88dvh] sm:max-w-3xl sm:animate-pop sm:rounded-2xl"
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-3 right-3 z-10 inline-flex size-9 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/70"
        >
          <X className="size-5" />
        </button>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col sm:grid sm:grid-cols-2">
          {/* Galería */}
          <div className="flex flex-col gap-2 bg-surface-2 p-3 sm:p-4" data-testid="product-gallery">
            <div
              className={`group relative flex aspect-square touch-pan-y items-center justify-center overflow-hidden rounded-xl bg-surface-3 select-none ${photos.length > 0 ? (zoomed ? 'cursor-zoom-out' : 'cursor-zoom-in') : ''}`}
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerCancel={() => (drag.current = null)}
            >
              {photo && !photoBroken ? (
                <img
                  key={photo}
                  src={photo}
                  alt={`${product.name} · foto ${index + 1} de ${photos.length}`}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  draggable={false}
                  onError={() => markFailed(photo)}
                  className={`size-full transition-transform duration-200 ${zoomed ? 'scale-[2] object-contain' : 'object-contain'}`}
                />
              ) : photo ? (
                <span className="flex flex-col items-center gap-1 text-ink-faint" data-testid="photo-fallback">
                  <ImageOff className="size-10" aria-hidden="true" />
                  <span className="text-xs">No se pudo cargar la foto</span>
                </span>
              ) : (
                <span className="relative flex size-full items-center justify-center text-teal-600 dark:text-teal-300">
                  <ProductImage name={product.name} category={product.category} imageUrl={null} className="size-1/2" />
                </span>
              )}
              {photo && !photoBroken && (
                <span className="pointer-events-none absolute right-2 bottom-2 inline-flex size-8 items-center justify-center rounded-full bg-black/50 text-white">
                  {zoomed ? <ZoomOut className="size-4" /> : <ZoomIn className="size-4" />}
                </span>
              )}
              {photos.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Foto anterior"
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerUp={(e) => e.stopPropagation()}
                    onClick={() => go(-1)}
                    className="absolute top-1/2 left-2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/65"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Foto siguiente"
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerUp={(e) => e.stopPropagation()}
                    onClick={() => go(1)}
                    className="absolute top-1/2 right-2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/65"
                  >
                    <ChevronRight className="size-5" />
                  </button>
                  <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-xs font-semibold text-white" data-testid="photo-counter">
                    {index + 1} / {photos.length}
                  </span>
                </>
              )}
            </div>

            {photos.length > 1 && (
              <div className="flex items-center justify-center gap-2" role="tablist" aria-label="Fotos del producto">
                {photos.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    role="tab"
                    aria-selected={i === index}
                    aria-label={`Ver foto ${i + 1}`}
                    onClick={() => {
                      setZoomed(false);
                      setIndex(i);
                    }}
                    className={`relative flex size-14 items-center justify-center overflow-hidden rounded-lg bg-surface-3 ring-2 transition-shadow ${i === index ? 'ring-brand' : 'ring-transparent hover:ring-line'}`}
                  >
                    {failed.has(src) ? (
                      <ImageOff className="size-4 text-ink-faint" aria-hidden="true" />
                    ) : (
                      <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" draggable={false} onError={() => markFailed(src)} className="size-full object-cover" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Datos */}
          <div className="flex flex-col gap-3 p-4 sm:p-5">
            <div>
              {storeName && (
                <Link to={`/app/servicios/${storeId}`} onClick={onClose} className="text-xs font-semibold text-brand hover:underline dark:text-teal-300">
                  {storeName}
                </Link>
              )}
              <h2 className="pr-10 text-xl leading-tight font-bold text-ink sm:pr-0">{product.name}</h2>
              <p className="text-sm text-ink-soft">{[product.category, product.unit].filter(Boolean).join(' · ')}</p>
            </div>

            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className={`text-3xl font-extrabold ${discount > 0 ? 'text-rose-700 dark:text-rose-400' : 'text-ink'}`} data-testid="detail-price">
                {formatSoles(product.priceCents)}
              </span>
              {discount > 0 && (
                <>
                  <span className="text-sm text-ink-faint line-through">{formatSoles(product.listPriceCents!)}</span>
                  <span className="rounded-full bg-rose-600 px-2 py-0.5 text-xs font-extrabold text-white">-{discount} %</span>
                </>
              )}
            </p>

            <p className={`text-sm font-semibold ${soldOut ? 'text-rose-700 dark:text-rose-400' : 'text-ink-soft'}`} data-testid="detail-stock">
              {soldOut ? 'Agotado' : product.stock <= 20 ? `Quedan ${product.stock}` : 'Disponible'}
            </p>

            {options.length > 1 && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-semibold text-ink">Presentación</legend>
                <div className="flex flex-wrap gap-2">
                  {options.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      aria-pressed={o.id === selectedId}
                      onClick={() => setSelectedId(o.id)}
                      disabled={o.stock === 0}
                      className={`rounded-xl px-3 py-2 text-left text-sm ring-1 transition-colors disabled:opacity-45 ${o.id === selectedId ? 'bg-teal-50 ring-2 ring-brand dark:bg-teal-950/60' : 'bg-surface ring-line hover:bg-surface-2'}`}
                    >
                      <span className="block font-semibold text-ink">{o.unit}</span>
                      <span className="block text-xs text-ink-soft">{formatSoles(o.priceCents)}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            <section aria-label="Descripción">
              <h3 className="mb-1 text-sm font-semibold text-ink">Descripción</h3>
              {product.description ? (
                <p className="text-sm whitespace-pre-line text-ink-soft" data-testid="detail-description">
                  {product.description}
                </p>
              ) : (
                <p className="text-sm text-ink-faint" data-testid="detail-description">
                  Esta tienda aún no agregó una descripción.
                </p>
              )}
            </section>
          </div>
        </div>

        {related.length > 0 && (
          <section aria-label="Más productos recomendados" data-testid="related-products" className="border-t border-line bg-surface-2 p-3 sm:p-5">
            <h3 className="mb-3 text-base font-bold text-ink">Más productos recomendados</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {related.map((e) => (
                <RelatedCard key={`${e.storeId}-${e.product.id}`} entry={e} onOpen={() => openRelated(e)} />
              ))}
            </div>
          </section>
        )}
        </div>

        <footer className="safe-bottom flex items-center gap-3 border-t border-line bg-surface p-3 sm:px-5">
          <span className="inline-flex items-center rounded-full bg-teal-50 p-1 dark:bg-teal-950/60" aria-label="Cantidad">
            <button
              type="button"
              aria-label="Quitar una unidad"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              className="inline-flex size-8 items-center justify-center rounded-full text-brand hover:bg-white disabled:opacity-40 dark:text-teal-300 dark:hover:bg-teal-900"
            >
              <Minus className="size-4" />
            </button>
            <span className="min-w-7 text-center text-sm font-bold text-ink" data-testid="detail-quantity">
              {quantity}
            </span>
            <button
              type="button"
              aria-label="Agregar una unidad"
              onClick={() => setQuantity((q) => Math.min(room, q + 1))}
              disabled={quantity >= room}
              className="inline-flex size-8 items-center justify-center rounded-full text-brand hover:bg-white disabled:opacity-40 dark:text-teal-300 dark:hover:bg-teal-900"
            >
              <Plus className="size-4" />
            </button>
          </span>
          <button
            type="button"
            onClick={add}
            disabled={soldOut || room === 0}
            data-testid="detail-add"
            className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-brand px-4 text-sm font-bold text-white transition-colors hover:bg-brand-strong disabled:opacity-50"
          >
            {soldOut ? 'Agotado' : room === 0 ? 'Ya tienes todo el stock en tu carrito' : `Agregar al carrito · ${formatSoles(total)}`}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

/** Tarjeta compacta de un producto recomendado: foto, nombre, precio y tienda. */
function RelatedCard({ entry, onOpen }: { entry: PoolEntry; onOpen: () => void }) {
  const { product, storeName } = entry;
  const discount = discountPercent(product.priceCents, product.listPriceCents);
  return (
    <button type="button" onClick={onOpen} data-testid="related-product" className="group flex flex-col gap-1.5 rounded-xl bg-surface p-2 text-left shadow-float transition-colors hover:bg-surface-2">
      <span className="relative flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-teal-50 to-cyan-50 text-teal-600 dark:from-teal-950/60 dark:to-cyan-950/60 dark:text-teal-300">
        <ProductImage name={product.name} category={product.category} imageUrl={product.imageUrl} className="size-[70%]" />
        {discount > 0 && <span className="absolute top-1.5 left-1.5 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white">-{discount} %</span>}
      </span>
      <span className="line-clamp-2 text-xs leading-tight font-semibold text-ink">{product.name}</span>
      <span className="flex flex-wrap items-baseline gap-x-1.5">
        <span className={`text-sm font-extrabold ${discount > 0 ? 'text-rose-700 dark:text-rose-400' : 'text-ink'}`}>{formatSoles(product.priceCents)}</span>
        {discount > 0 && <span className="text-[11px] text-ink-faint line-through">{formatSoles(product.listPriceCents!)}</span>}
      </span>
      {storeName && <span className="truncate text-[11px] text-ink-soft">{storeName}</span>}
    </button>
  );
}
