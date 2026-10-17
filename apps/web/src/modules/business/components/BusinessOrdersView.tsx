import { ChevronRight, Store } from 'lucide-react';
import { Avatar } from '@shared/ui/Avatar';
import { EmptyState, ErrorState, ListSkeleton } from '@shared/ui/States';
import { EmptyChatsIllustration } from '@shared/ui/illustrations';
import { formatListTimestamp } from '@shared/utils/date';
import { formatSoles } from '@shared/utils/money';
import { OrderStatusBadge, PageHeader, ServicePage } from '../../services/components/ServicesUi';
import { BUSINESS_TABS } from '../const/business.const';
import { useBusinessOrders } from '../hooks/use-business.hook';
import { StoreSettingsCard } from './StoreSettingsCard';

/** «Mi negocio»: los pedidos que recibe el dueño, para aceptarlos, prepararlos y entregarlos a Rapidito. */
export function BusinessOrdersView() {
  const b = useBusinessOrders();
  return (
    <ServicePage>
      <PageHeader title="Mi negocio" subtitle={b.business ? `${b.business.name} · pedidos con delivery Rapidito` : 'Pedidos con delivery Rapidito'} onBack={b.back} />

      <StoreSettingsCard />

      <div className="-mt-2 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Filtrar pedidos del negocio">
        {BUSINESS_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={b.tab === t.id}
            onClick={() => b.selectTab(t.id)}
            className={`h-9 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors duration-200 ${b.tab === t.id ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200' : 'bg-surface text-ink-soft shadow-float hover:text-ink'}`}
          >
            {t.label}
            {b.counts[t.id] > 0 && ` · ${b.counts[t.id]}`}
          </button>
        ))}
      </div>

      {b.error && b.orders.length === 0 ? (
        <ErrorState message={b.error} onRetry={b.reload} />
      ) : b.loading ? (
        <ListSkeleton rows={4} />
      ) : b.orders.length === 0 ? (
        <EmptyState
          compact
          illustration={<EmptyChatsIllustration />}
          title={b.tab === 'nuevos' ? 'Sin pedidos nuevos' : 'Nada por aquí'}
          description={b.tab === 'nuevos' ? 'Cuando un cliente pague un pedido, aparece aquí y te avisamos.' : 'Los pedidos pasan a esta pestaña según avanzan.'}
        />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-float" data-testid="business-orders">
          {b.orders.map((order) => (
            <li key={order.id}>
              <button
                type="button"
                onClick={() => b.open(order.id)}
                data-testid="business-order-item"
                className="group flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-200 hover:bg-surface-2 md:px-5"
              >
                <Avatar name={order.customer.displayName} color={order.customer.avatarColor} photo={order.customer.avatarUrl} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-ink">
                    {order.customer.displayName} · {formatSoles(order.totalCents)}
                  </span>
                  <span className="block truncate text-sm text-ink-soft">
                    {order.lines.map((l) => `${l.quantity}× ${l.name}`).join(', ')} · {formatListTimestamp(order.createdAt)}
                  </span>
                </span>
                <OrderStatusBadge status={order.status} />
                <ChevronRight className="size-5 shrink-0 text-ink-faint transition-transform duration-200 group-hover:translate-x-0.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink-faint">
        <Store className="size-3.5" /> Aceptas, preparas y avisas a Rapidito; el cliente ve cada paso en vivo.
      </p>
    </ServicePage>
  );
}
