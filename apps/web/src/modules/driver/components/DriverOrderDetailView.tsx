import { Ban, Bike, KeyRound, MapPin, MessageCircle, Navigation, PackageCheck, ShieldCheck, Store, Undo2 } from 'lucide-react';
import { useDriverStore } from '@shared/stores/driver.store';
import { LazyDeliveryMap } from '@shared/ui/LazyDeliveryMap';
import { useRoute } from '../../services/hooks/use-route.hook';
import { Button } from '@shared/ui/Button';
import { ErrorState, ListSkeleton } from '@shared/ui/States';
import { formatTime } from '@shared/utils/date';
import { formatSoles } from '@shared/utils/money';
import { OrderStatusBadge, OrderTimeline, PageHeader, ServicePage } from '../../services/components/ServicesUi';
import { useOrderChat } from '../../services/hooks/use-order-chat.hook';
import { useDriverOrderDetail } from '../hooks/use-driver.hook';

/**
 * Una entrega de Rapidito: tomarla, recogerla en la tienda (la tienda confirma que te la entregó) y
 * entregarla con el código que te dicta el cliente. Se puede escribir a la tienda y al cliente.
 */
export function DriverOrderDetailView() {
  const d = useDriverOrderDetail();
  const order = d.order;
  const chat = useOrderChat(order?.id);
  const sharing = useDriverStore((s) => s.sharing);
  const myLocation = useDriverStore((s) => s.myLocation);
  const pickingUp = order?.status === 'driver_assigned';
  // Ruta por las calles: de donde estás a la tienda (si aún no recoges) y de ahí al cliente.
  const route = useRoute(
    order ? [order.mine ? myLocation : null, pickingUp || !order.mine ? order.business.location : null, order.address.location] : [],
    !!order && (order.status === 'searching_driver' || (order.mine && (order.status === 'driver_assigned' || order.status === 'on_the_way'))),
  );

  if (!order) {
    return (
      <ServicePage>
        <PageHeader title="Entrega" onBack={d.back} />
        {d.error ? <ErrorState message={d.error} onRetry={d.retry} /> : <ListSkeleton rows={4} />}
      </ServicePage>
    );
  }

  const delivered = order.timeline.find((t) => t.status === 'delivered');
  const onRoute = order.mine && (order.status === 'driver_assigned' || order.status === 'on_the_way');
  return (
    <ServicePage>
      <PageHeader
        title={`Entrega · ganas ${formatSoles(order.earningsCents)}`}
        subtitle={order.tipCents > 0 ? `Pedido de ${order.customerName} · incluye ${formatSoles(order.tipCents)} de propina` : `Pedido de ${order.customerName}`}
        onBack={d.back}
        action={order.mine ? <OrderStatusBadge status={order.status} /> : undefined}
      />

      {(onRoute || order.status === 'searching_driver') && (
        <section className="flex flex-col gap-2" aria-label="Mapa de la entrega">
          <LazyDeliveryMap
            store={order.business.location}
            destination={order.address.location ?? null}
            driver={onRoute ? myLocation : null}
            route={route?.path}
            label="Mapa con la tienda, el destino y tu ubicación"
          />
          {route && (
            <p className="px-1 text-xs font-semibold text-ink-soft" data-testid="route-summary">
              Ruta por calles: {route.distanceKm.toFixed(1)} km · unos {route.minutes} min
            </p>
          )}
          {onRoute && <SharingNote sharing={sharing} />}
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-float md:p-5" aria-label="Ruta">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
            <Store className="size-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-ink-faint">1 · Recoge en</p>
            <p className="font-bold text-ink">{order.business.name}</p>
            <p className="text-sm text-ink-soft">{order.business.address}</p>
          </div>
          {order.mine && order.status !== 'delivered' && (
            <Button variant="ghost" size="sm" icon={<MessageCircle className="size-4" />} onClick={() => chat.open('business')} loading={chat.opening === 'business'} data-testid="chat-store">
              Tienda
            </Button>
          )}
        </div>
        <div className="ml-[18px] h-4 border-l-2 border-dashed border-line" aria-hidden="true" />
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200">
            <MapPin className="size-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-ink-faint">2 · Entrega a {order.customerName}</p>
            <p className="font-bold text-ink">{order.address.line}</p>
            {order.address.reference && <p className="text-sm text-ink-soft">{order.address.reference}</p>}
          </div>
          {order.mine && order.status !== 'delivered' && (
            <Button variant="ghost" size="sm" icon={<MessageCircle className="size-4" />} onClick={() => chat.open('customer')} loading={chat.opening === 'customer'} data-testid="chat-customer">
              Cliente
            </Button>
          )}
        </div>
      </section>

      {!order.mine && order.status === 'searching_driver' && (
        <Button size="lg" fullWidth icon={<Bike className="size-5" />} onClick={d.accept} loading={d.busy} data-testid="take-order">
          Tomar este pedido
        </Button>
      )}

      {order.mine && order.status === 'driver_assigned' && (
        <section className="flex items-center gap-4 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200 md:p-5 dark:bg-amber-950/40 dark:ring-amber-900" aria-label="Recoger">
          <PackageCheck className="size-6 shrink-0 text-amber-700 dark:text-amber-300" />
          <p className="text-sm text-ink">
            Ve a <span className="font-semibold">{order.business.name}</span>. La tienda confirma en su app que te entregó el pedido; recién ahí sigue la entrega.
          </p>
        </section>
      )}

      {order.mine && order.status === 'driver_assigned' && (
        <Button variant="ghost" className="self-center" icon={<Undo2 className="size-4" />} onClick={d.release} loading={d.busy} data-testid="release-order">
          No puedo llevarlo
        </Button>
      )}

      {order.status === 'cancelled' && (
        <section className="flex items-center gap-4 rounded-2xl bg-surface-3 p-4 md:p-5" aria-label="Cancelado" data-testid="order-stopped">
          <Ban className="size-6 shrink-0 text-ink-soft" />
          <p className="text-sm font-semibold text-ink">{order.business.name} canceló este pedido. No tienes que recogerlo ni entregarlo.</p>
        </section>
      )}

      {order.mine && order.status === 'on_the_way' && (
        <form onSubmit={d.deliver} className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-float md:p-5" aria-label="Entregar con código">
          <p className="flex items-center gap-2 font-bold text-ink">
            <KeyRound className="size-5 text-brand" /> Pídele a {order.customerName} su código de entrega
          </p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            value={d.code}
            onChange={(e) => d.onCodeChange(e.target.value)}
            aria-label="Código de entrega"
            placeholder="0000"
            className="h-14 w-full rounded-2xl bg-surface-3 text-center font-mono text-3xl font-extrabold tracking-[0.5em] text-ink outline-none placeholder:text-ink-faint focus:ring-2 focus:ring-teal-500/40"
          />
          {d.codeError && <p role="alert" className="text-sm font-semibold text-rose-700 dark:text-rose-400">{d.codeError}</p>}
          <Button type="submit" size="lg" icon={<ShieldCheck className="size-5" />} loading={d.busy} data-testid="deliver-order">
            Confirmar entrega
          </Button>
        </form>
      )}

      {delivered && (
        <section className="flex items-center gap-4 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200 md:p-5 dark:bg-emerald-950/40 dark:ring-emerald-900" aria-label="Entregado" data-testid="delivery-proof">
          <ShieldCheck className="size-6 shrink-0 text-emerald-700 dark:text-emerald-300" />
          <p className="text-sm font-semibold text-ink">Entregado a {order.customerName} a las {formatTime(delivered.at)} · confirmado con su código.</p>
        </section>
      )}

      <section className="flex flex-col gap-1.5 rounded-2xl bg-surface p-4 text-sm shadow-float md:p-5" aria-label="Lo que ganas" data-testid="driver-split">
        <h2 className="mb-1 text-sm font-bold text-ink-soft">Lo que ganas</h2>
        <p className="flex justify-between text-ink-soft"><span>Tarifa de delivery</span><span className="font-semibold text-ink">{formatSoles(order.deliveryFeeCents)}</span></p>
        <p className="flex justify-between text-ink-soft"><span>Comisión Rapidito (5 %)</span><span className="font-semibold text-ink">− {formatSoles(order.commissionCents)}</span></p>
        {order.tipCents > 0 && <p className="flex justify-between text-ink-soft"><span>Propina (100 % para ti)</span><span className="font-semibold text-ink">+ {formatSoles(order.tipCents)}</span></p>}
        <p className="mt-1 flex justify-between border-t border-dashed border-line pt-1.5 text-base font-extrabold text-ink"><span>Para ti</span><span>{formatSoles(order.earningsCents)}</span></p>
      </section>

      <section className="flex flex-col gap-2 rounded-2xl bg-surface p-4 shadow-float md:p-5" aria-label="Productos">
        <h2 className="text-sm font-bold text-ink-soft">Revisa que lleves todo</h2>
        {order.lines.map((line) => (
          <p key={line.productId} className="text-sm text-ink">
            <span className="font-semibold">{line.quantity}×</span> {line.name} <span className="text-ink-faint">· {line.unit}</span>
          </p>
        ))}
      </section>

      {order.mine && <OrderTimeline entries={order.timeline} />}
    </ServicePage>
  );
}

/** Si el cliente y la tienda te están viendo en el mapa. */
function SharingNote({ sharing }: { sharing: 'off' | 'sharing' | 'denied' | 'unavailable' }) {
  const text = {
    sharing: 'Compartiendo tu ubicación con el cliente y la tienda mientras dura la entrega.',
    off: 'Activando tu ubicación…',
    denied: 'Permite la ubicación en tu navegador para que el cliente te siga en el mapa.',
    unavailable: 'No pudimos leer tu ubicación. Revisa el GPS de tu celular.',
  }[sharing];
  return (
    <p className={`flex items-center gap-1.5 px-1 text-xs font-semibold ${sharing === 'sharing' ? 'text-brand dark:text-teal-300' : 'text-amber-700 dark:text-amber-300'}`} data-testid="sharing-note" data-sharing={sharing}>
      <Navigation className="size-3.5" /> {text}
    </p>
  );
}
