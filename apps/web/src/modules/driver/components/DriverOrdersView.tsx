import { Bike, ChevronRight, MapPin, Store, UserRound } from 'lucide-react';
import { Link } from 'react-router';
import { Toggle } from '@shared/ui/Toggle';
import type { DriverOrder } from '@parla/types';
import { EmptyState, ErrorState, ListSkeleton } from '@shared/ui/States';
import { EmptyChatsIllustration } from '@shared/ui/illustrations';
import { formatListTimestamp } from '@shared/utils/date';
import { formatSoles } from '@shared/utils/money';
import { OrderStatusBadge, PageHeader, ServicePage } from '../../services/components/ServicesUi';
import { useDriverOrders } from '../hooks/use-driver.hook';

/** Rapidito para repartidores: pedidos listos para recoger cerca, y mis entregas. */
export function DriverOrdersView() {
  const r = useDriverOrders();
  return (
    <ServicePage>
      <PageHeader
        title="Rapidito"
        subtitle={r.driver ? `Repartidor · ${r.driver.vehicle}${r.driver.plate ? ` ${r.driver.plate}` : ''}` : 'Repartidor'}
        onBack={r.back}
        action={
          <Link to="/app/rapidito/perfil" aria-label="Mi perfil de repartidor" title="Mi perfil de repartidor" data-testid="driver-profile-link" className="inline-flex size-10 items-center justify-center rounded-full text-ink-soft transition-colors duration-200 hover:bg-surface-3 hover:text-ink">
            <UserRound className="size-5" />
          </Link>
        }
      />

      {r.driver && (
        <section className={`rounded-2xl p-3 shadow-float md:px-4 ${r.driver.online ? 'bg-surface' : 'bg-amber-50 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:ring-amber-900'}`}>
          <Toggle
            checked={r.driver.online}
            onChange={r.toggleOnline}
            disabled={r.togglingOnline}
            label={r.driver.online ? 'Conectado' : 'Desconectado'}
            description={r.driver.online ? 'Te llegan los pedidos listos para recoger.' : 'Conéctate para ver y tomar pedidos.'}
          />
        </section>
      )}

      {r.active && (
        <button
          type="button"
          onClick={() => r.open(r.active!.id)}
          data-testid="active-delivery"
          className="group flex items-center gap-4 rounded-2xl bg-gradient-to-br from-teal-600 to-cyan-700 p-4 text-left text-white shadow-float transition-[filter] duration-200 hover:brightness-110 md:px-5"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/20">
            <Bike className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold">Entrega en curso</span>
            <span className="block truncate text-sm text-teal-50">
              {r.active.status === 'driver_assigned' ? `Recoger en ${r.active.business.name}` : `Llevar a ${r.active.customerName} · ${r.active.address.line}`}
            </span>
          </span>
          <ChevronRight className="size-5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
        </button>
      )}

      <div className="-mt-2 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Pedidos de Rapidito">
        {(
          [
            ['disponibles', `Para recoger${r.available.length ? ` · ${r.available.length}` : ''}`],
            ['mias', 'Mis entregas'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={r.tab === id}
            onClick={() => r.selectTab(id)}
            className={`h-9 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors duration-200 ${r.tab === id ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200' : 'bg-surface text-ink-soft shadow-float hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {r.error && r.orders.length === 0 ? (
        <ErrorState message={r.error} onRetry={r.reload} />
      ) : r.loading ? (
        <ListSkeleton rows={3} />
      ) : r.orders.length === 0 ? (
        <EmptyState
          compact
          illustration={<EmptyChatsIllustration />}
          title={r.tab === 'disponibles' ? 'Nada para recoger por ahora' : 'Aún no tienes entregas'}
          description={r.tab === 'disponibles' ? 'Cuando una tienda tenga un pedido listo, aparece aquí y te avisamos.' : 'Toma un pedido de «Para recoger» para empezar.'}
        />
      ) : (
        <ul className="flex flex-col gap-3" data-testid="driver-orders">
          {r.orders.map((order) => (
            <li key={order.id}>
              <DriverOrderCard order={order} onOpen={() => r.open(order.id)} />
            </li>
          ))}
        </ul>
      )}
    </ServicePage>
  );
}

function DriverOrderCard({ order, onOpen }: { order: DriverOrder; onOpen: () => void }) {
  const units = order.lines.reduce((sum, l) => sum + l.quantity, 0);
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="driver-order-item"
      className="group flex w-full flex-col gap-2 rounded-2xl bg-surface p-4 text-left shadow-float transition-colors duration-200 hover:bg-surface-2 md:px-5"
    >
      <span className="flex items-center justify-between gap-3">
        <span className="text-lg font-extrabold text-ink">Ganas {formatSoles(order.deliveryFeeCents)}</span>
        {order.mine ? <OrderStatusBadge status={order.status} /> : <span className="text-xs text-ink-faint">{formatListTimestamp(order.updatedAt)}</span>}
      </span>
      <span className="flex items-start gap-2 text-sm text-ink">
        <Store className="mt-0.5 size-4 shrink-0 text-brand" />
        <span className="min-w-0">
          <span className="font-semibold">{order.business.name}</span> · {order.business.address}
        </span>
      </span>
      <span className="flex items-start gap-2 text-sm text-ink-soft">
        <MapPin className="mt-0.5 size-4 shrink-0" />
        <span className="min-w-0">
          {order.customerName} · {order.address.line}
        </span>
      </span>
      <span className="text-xs text-ink-faint">{units} {units === 1 ? 'producto' : 'productos'}</span>
    </button>
  );
}
