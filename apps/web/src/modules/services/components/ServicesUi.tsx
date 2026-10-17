import type { OrderStatus } from '@parla/types';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
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
  paid: 'bg-teal-100 text-teal-900 dark:bg-teal-900/50 dark:text-teal-200',
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
