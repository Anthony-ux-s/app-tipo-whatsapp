import { Bike, ChevronRight, MapPin, Package, Route, Store, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@shared/ui/Button';
import { Toggle } from '@shared/ui/Toggle';
import type { DriverOrder } from '@parla/types';
import { EmptyState, ErrorState, ListSkeleton } from '@shared/ui/States';
import { EmptyChatsIllustration } from '@shared/ui/illustrations';
import { formatListTimestamp } from '@shared/utils/date';
import { formatDistance } from '@shared/utils/geo';
import { formatSoles } from '@shared/utils/money';
import { OrderStatusBadge, PageHeader, ServicePage } from '../../services/components/ServicesUi';
import { useDriverOrders } from '../hooks/use-driver.hook';
import { DriverReviewCard } from './DriverReviewCard';

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
          <span className="flex">
            <Link to="/app/rapidito/rutas" aria-label="Mis rutas" title="Mis rutas" data-testid="driver-routes-link" className="inline-flex size-10 items-center justify-center rounded-full text-ink-soft transition-colors duration-200 hover:bg-surface-3 hover:text-ink">
              <Route className="size-5" />
            </Link>
            <Link to="/app/rapidito/perfil" aria-label="Mi perfil de repartidor" title="Mi perfil de repartidor" data-testid="driver-profile-link" className="inline-flex size-10 items-center justify-center rounded-full text-ink-soft transition-colors duration-200 hover:bg-surface-3 hover:text-ink">
              <UserRound className="size-5" />
            </Link>
          </span>
        }
      />

      {r.driver && <DriverReviewCard driver={r.driver} />}

      {r.driver?.status === 'approved' && (
        <section className={`rounded-2xl p-3 shadow-float md:px-4 ${r.driver.online ? 'bg-surface' : 'bg-amber-50 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:ring-amber-900'}`}>
          <Toggle
            checked={r.driver.online}
            onChange={r.toggleOnline}
            disabled={r.togglingOnline}
            label={r.driver.online ? 'Conectado' : 'Desconectado'}
            description={r.driver.online ? 'Te llegan los pedidos listos para recoger cerca de ti.' : 'Conéctate para ver y tomar pedidos.'}
          />
        </section>
      )}

      {r.active && (
        <button
          type="button"
          onClick={() => (r.activeCount > 1 ? r.openRoutes() : r.open(r.active!.id))}
          data-testid="active-delivery"
          className="group flex items-center gap-4 rounded-2xl bg-gradient-to-br from-teal-600 to-cyan-700 p-4 text-left text-white shadow-float transition-[filter] duration-200 hover:brightness-110 md:px-5"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/20">
            <Bike className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold">{r.activeCount > 1 ? `${r.activeCount} entregas en curso` : 'Entrega en curso'}</span>
            <span className="block truncate text-sm text-white">
              {r.activeCount > 1
                ? 'Ver el mejor orden en Mis rutas'
                : r.active.status === 'driver_assigned'
                  ? `Recoger en ${r.active.business.name}`
                  : `Llevar a ${r.active.customerName} · ${r.active.address.line}`}
            </span>
          </span>
          <ChevronRight className="size-5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
        </button>
      )}

      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-surface-3 p-1" role="tablist" aria-label="Pedidos de Rapidito">
        {(
          [
            ['disponibles', 'Para recoger', r.available.length],
            ['mias', 'Mis entregas', 0],
          ] as const
        ).map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={r.tab === id}
            onClick={() => r.selectTab(id)}
            className={`flex h-12 items-center justify-center gap-2 rounded-xl text-[15px] font-bold transition-all duration-200 ${r.tab === id ? 'bg-surface text-ink shadow-float' : 'text-ink-soft hover:text-ink'}`}
          >
            {label}
            {count > 0 && <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-500 px-1.5 text-xs font-extrabold text-white">{count}</span>}
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
              <DriverOrderCard order={order} onOpen={() => r.open(order.id)} onTake={() => void r.take(order.id)} taking={r.taking === order.id} />
            </li>
          ))}
        </ul>
      )}
    </ServicePage>
  );
}

function DriverOrderCard({ order, onOpen, onTake, taking }: { order: DriverOrder; onOpen: () => void; onTake: () => void; taking: boolean }) {
  const units = order.lines.reduce((sum, l) => sum + l.quantity, 0);
  const forMe = !order.mine && !!order.exclusiveUntil;
  return (
    <article
      data-testid="driver-order-item"
      className={`flex flex-col gap-3 rounded-3xl bg-surface p-4 shadow-float md:p-5 ${forMe ? 'ring-2 ring-amber-400' : ''}`}
    >
      <button type="button" onClick={onOpen} className="group flex flex-col gap-3 text-left">
        <span className="flex items-start justify-between gap-3">
          <span>
            <span className="block text-xs font-bold tracking-wide text-ink-faint uppercase">Ganas</span>
            <span className="block font-display text-3xl leading-none font-extrabold text-ink">{formatSoles(order.earningsCents)}</span>
            {order.collectOnArrivalCents > 0 && <span className="mt-1 mr-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-ink dark:bg-amber-950 dark:text-amber-300">Cobras {formatSoles(order.collectOnArrivalCents)} en mano</span>}
            {order.tipCents > 0 && <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-ink dark:bg-emerald-950 dark:text-emerald-300">+ {formatSoles(order.tipCents)} de propina 🎉</span>}
          </span>
          {order.mine ? (
            <OrderStatusBadge status={order.status} />
          ) : forMe ? (
            <ExclusiveBadge until={order.exclusiveUntil!} />
          ) : (
            <span className="text-xs text-ink-faint">{formatListTimestamp(order.updatedAt)}</span>
          )}
        </span>
        <span className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            <Store className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-bold text-ink">{order.business.name}</span>
            <span className="block truncate text-sm text-ink-soft">
              {order.distanceToStoreKm !== null && !order.mine ? (
                <b className="text-brand dark:text-teal-300" data-testid="distance-to-store">a {formatDistance(order.distanceToStoreKm)} de ti</b>
              ) : (
                order.business.address
              )}
            </span>
          </span>
        </span>
        <span className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-brand dark:bg-teal-950 dark:text-teal-300">
            <MapPin className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-bold text-ink">{order.customerName}</span>
            <span className="block truncate text-sm text-ink-soft">{order.address.line}</span>
          </span>
        </span>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-faint">
          <Package className="size-3.5" /> {units} {units === 1 ? 'producto' : 'productos'} · ver detalle
          <ChevronRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
        </span>
      </button>
      {!order.mine && order.status === 'searching_driver' && (
        <Button size="lg" fullWidth icon={<Bike className="size-5" />} onClick={onTake} loading={taking} data-testid="take-from-list">
          Tomar pedido
        </Button>
      )}
    </article>
  );
}

/** Asignación óptima: este pedido se eligió para ti; cuenta los segundos que quedan para aceptarlo. */
function ExclusiveBadge({ until }: { until: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil((new Date(until).getTime() - now) / 1000));
  return (
    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-ink dark:bg-amber-950 dark:text-ink" data-testid="exclusive-offer">
      {seconds > 0 ? `Para ti · ${seconds} s` : 'Se pasó al siguiente'}
    </span>
  );
}
