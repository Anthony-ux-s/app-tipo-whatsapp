import { ChevronRight, ShoppingBasket } from 'lucide-react';
import { Button } from '@shared/ui/Button';
import { ProfileButton } from '@shared/ui/ProfileButton';
import { EmptyState, ErrorState, ListSkeleton } from '@shared/ui/States';
import { EmptyChatsIllustration } from '@shared/ui/illustrations';
import { formatListTimestamp } from '@shared/utils/date';
import { formatSoles } from '@shared/utils/money';
import { useOrders } from '../hooks/use-orders.hook';
import { OrderStatusBadge, PageHeader, ServicePage } from './ServicesUi';

/** Delivery («Mis pedidos»): historial y seguimiento en vivo de cada pedido. */
export function OrdersView() {
  const o = useOrders();
  return (
    <ServicePage>
      <PageHeader title="Delivery" subtitle="Tus pedidos y su seguimiento en vivo." action={<ProfileButton />} />
      {o.error && o.orders.length === 0 ? (
        <ErrorState message={o.error} onRetry={o.reload} />
      ) : o.loading && o.orders.length === 0 ? (
        <ListSkeleton rows={4} />
      ) : o.orders.length === 0 ? (
        <EmptyState
          illustration={<EmptyChatsIllustration />}
          title="Aún no tienes pedidos"
          description="Haz tu primer mercado: llega a tu puerta con delivery."
          action={<Button icon={<ShoppingBasket className="size-4" />} onClick={() => o.back()}>Ver servicios</Button>}
        />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-float">
          {o.orders.map((order) => (
            <li key={order.id}>
              <button
                type="button"
                onClick={() => o.open(order.id)}
                data-testid="order-item"
                className="group flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-200 hover:bg-surface-2 md:px-5"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-brand dark:bg-teal-950/60 dark:text-teal-300">
                  <ShoppingBasket className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-ink">
                    Mercado · {formatSoles(order.totalCents)}
                  </span>
                  <span className="block truncate text-sm text-ink-soft">
                    {order.lines.map((l) => l.name).join(', ')} · {formatListTimestamp(order.createdAt)}
                  </span>
                </span>
                <OrderStatusBadge status={order.status} />
                <ChevronRight className="size-5 shrink-0 text-ink-faint transition-transform duration-200 group-hover:translate-x-0.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </ServicePage>
  );
}
