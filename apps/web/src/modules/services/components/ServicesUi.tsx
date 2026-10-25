import type { BusinessStatus, OrderStatus, OrderTimelineEntry } from '@parla/types';
import { ArrowLeft, Moon, ShoppingCart } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { formatTime } from '@shared/utils/date';
import { formatSoles } from '@shared/utils/money';
import { ORDER_STATUS_LABELS } from '../const/services.const';

/** Contenedor de las pantallas de Servicios: ancho cómodo y desplazamiento propio. */
export function ServicePage({ children, footer, wide }: { children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-canvas">
      <div className="flex-1 overflow-y-auto">
        <div className={`mx-auto flex ${wide ? 'max-w-6xl' : 'max-w-3xl'} flex-col gap-5 px-3 pt-3 pb-8 sm:px-4 md:gap-6 md:px-6 md:pt-6 lg:px-8`}>{children}</div>
      </div>
      {footer}
    </div>
  );
}

/** Encabezado con flecha para volver. */
export function PageHeader({ title, subtitle, onBack, action }: { title: string; subtitle?: string; onBack?: () => void; action?: ReactNode }) {
  return (
    <header className="flex items-start gap-2">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Volver"
          title="Volver"
          className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors duration-200 hover:bg-surface-3 hover:text-ink"
        >
          <ArrowLeft className="size-5" />
        </button>
      )}
      <div className="min-w-0 flex-1 pt-1">
        <h1 className="text-lg font-extrabold text-ink md:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-xs text-ink-soft md:text-sm">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

const STATUS_STYLES: Record<OrderStatus, string> = {
  pending_payment: 'bg-cyan-50 text-ink ring-1 ring-cyan-300 dark:bg-cyan-950/50 dark:text-ink dark:ring-cyan-800',
  paid: 'bg-amber-100 text-ink dark:bg-amber-900/50 dark:text-ink',
  preparing: 'bg-teal-100 text-ink dark:bg-teal-900/50 dark:text-ink',
  rejected: 'bg-rose-100 text-ink dark:bg-rose-900/50 dark:text-ink',
  searching_driver: 'bg-teal-100 text-ink dark:bg-teal-900/50 dark:text-ink',
  driver_assigned: 'bg-cyan-100 text-ink dark:bg-cyan-900/50 dark:text-ink',
  on_the_way: 'bg-cyan-100 text-ink dark:bg-cyan-900/50 dark:text-ink',
  delivered: 'bg-emerald-100 text-ink dark:bg-emerald-900/50 dark:text-ink',
  payment_expired: 'bg-surface-3 text-ink-soft',
  cancelled: 'bg-surface-3 text-ink-soft',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span data-testid="order-status" data-status={status} className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLES[status]}`}>
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}

/** Fila de montos: etiqueta a la izquierda, valor a la derecha. */
export function AmountRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 ${strong ? 'text-base font-extrabold text-ink' : 'text-sm text-ink-soft'}`}>
      <span>{label}</span>
      <span className={strong ? '' : 'font-semibold text-ink'}>{value}</span>
    </div>
  );
}

/** Barra inferior con el carrito del Mercado (solo si tiene algo). */
export function CartBar({ count, estimateCents, onOpen }: { count: number; estimateCents: number; onOpen: () => void }) {
  if (count === 0) return null;
  return (
    <div className="safe-bottom border-t border-line bg-surface p-3 md:px-6">
      <button
        type="button"
        onClick={onOpen}
        data-testid="cart-bar"
        className="mx-auto flex w-full max-w-3xl animate-rise items-center gap-3 rounded-2xl bg-brand px-4 py-3 text-left text-white shadow-pop transition-colors duration-200 hover:bg-brand-strong"
      >
        <span className="relative">
          <ShoppingCart className="size-6" />
          <span className="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-400 px-1 text-[11px] font-bold text-ink">
            {count}
          </span>
        </span>
        <span className="flex-1 font-bold">Ver carrito</span>
        <span className="text-sm text-white">aprox.</span>
        <span className="font-extrabold">{formatSoles(estimateCents)}</span>
      </button>
    </div>
  );
}

/** Qué se ve en la línea de tiempo por cada paso (la misma para cliente, tienda y repartidor). */
const TIMELINE_LABELS: Record<OrderStatus, string> = {
  pending_payment: 'Pedido creado',
  paid: 'Pago recibido',
  preparing: 'La tienda aceptó el pedido',
  rejected: 'La tienda no aceptó el pedido',
  searching_driver: 'Listo para recoger',
  driver_assigned: 'Repartidor asignado',
  on_the_way: 'Recogido en la tienda',
  delivered: 'Entregado al cliente',
  payment_expired: 'El cobro venció',
  cancelled: 'Cancelado',
};

/** Constancia del pedido: cada paso con su hora (como el historial de PedidosYa o Rappi). */
export function OrderTimeline({ entries }: { entries: OrderTimelineEntry[] }) {
  return (
    <section className="rounded-2xl bg-surface p-4 shadow-float md:p-5" aria-label="Historial del pedido" data-testid="order-timeline">
      <h2 className="mb-3 text-sm font-bold text-ink-soft">Historial</h2>
      <ol className="flex flex-col gap-3">
        {entries.map((entry, i) => {
          const last = i === entries.length - 1;
          return (
            <li key={`${entry.status}-${entry.at}`} className="relative flex gap-3 pl-1">
              {!last && <span aria-hidden="true" className="absolute top-4 left-[9px] h-[calc(100%+4px)] w-px bg-line" />}
              <span className={`relative mt-1 size-3 shrink-0 rounded-full ring-4 ${last ? 'bg-brand ring-teal-100 dark:ring-teal-900/60' : 'bg-teal-300 ring-transparent dark:bg-teal-700'}`} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className={`text-sm ${last ? 'font-bold text-ink' : 'font-medium text-ink'}`}>{TIMELINE_LABELS[entry.status]}</span>
                  <span className="shrink-0 text-xs text-ink-faint">{formatTime(entry.at)}</span>
                </span>
                {entry.note && <span className="block text-xs text-ink-soft">{entry.note}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Aviso de tienda cerrada (fuera de horario o pausada por el dueño): se puede mirar, no pagar. */
export function StoreClosedBanner({ status }: { status: BusinessStatus | null }) {
  if (!status || status.open) return null;
  return (
    <div role="status" data-testid="store-closed" className="flex items-center gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:ring-amber-900">
      <Moon className="size-5 shrink-0 text-amber-700 dark:text-amber-300" />
      <p className="text-sm text-ink">
        <span className="font-semibold">{status.closedMessage}</span> Puedes armar tu carrito y pagar cuando abra.
      </p>
    </div>
  );
}

/** Miniatura de la primera foto de un producto del pedido (si falla o no hay, no se muestra nada roto). */
export function LineThumb({ src, name }: { src?: string | null; name: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return null;
  return <img src={src} alt={name} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="size-10 shrink-0 rounded-lg bg-surface-3 object-cover" data-testid="line-thumb" />;
}
