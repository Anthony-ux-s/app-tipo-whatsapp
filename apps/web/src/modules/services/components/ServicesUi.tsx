import type { OrderStatus } from '@parla/types';
import { ArrowLeft, ShoppingCart } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatSoles } from '@shared/utils/money';
import { ORDER_STATUS_LABELS } from '../const/services.const';

/** Contenedor de las pantallas de Servicios: ancho cómodo y desplazamiento propio. */
export function ServicePage({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col bg-canvas">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-5 px-3 pt-3 pb-8 sm:px-4 md:gap-6 md:px-6 md:pt-6 lg:px-8">{children}</div>
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
        <h1 className="text-xl font-extrabold text-ink md:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

const STATUS_STYLES: Record<OrderStatus, string> = {
  pending_payment: 'bg-cyan-50 text-cyan-900 ring-1 ring-cyan-300 dark:bg-cyan-950/50 dark:text-cyan-200 dark:ring-cyan-800',
  paid: 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200',
  preparing: 'bg-teal-100 text-teal-900 dark:bg-teal-900/50 dark:text-teal-200',
  rejected: 'bg-rose-100 text-rose-900 dark:bg-rose-900/50 dark:text-rose-200',
  searching_driver: 'bg-teal-100 text-teal-900 dark:bg-teal-900/50 dark:text-teal-200',
  on_the_way: 'bg-cyan-100 text-cyan-900 dark:bg-cyan-900/50 dark:text-cyan-200',
  delivered: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200',
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
          <span className="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-400 px-1 text-[11px] font-bold text-teal-950">
            {count}
          </span>
        </span>
        <span className="flex-1 font-bold">Ver carrito</span>
        <span className="text-sm text-teal-100">aprox.</span>
        <span className="font-extrabold">{formatSoles(estimateCents)}</span>
      </button>
    </div>
  );
}
