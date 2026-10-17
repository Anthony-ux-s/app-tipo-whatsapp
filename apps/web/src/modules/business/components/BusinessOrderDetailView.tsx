import { Bike, Check, MapPin, MessageCircle, PackageCheck, ShieldCheck, X } from 'lucide-react';
import { Avatar } from '@shared/ui/Avatar';
import { Button } from '@shared/ui/Button';
import { Modal } from '@shared/ui/Modal';
import { ErrorState, ListSkeleton } from '@shared/ui/States';
import { formatTime } from '@shared/utils/date';
import { formatLongDate, formatSoles } from '@shared/utils/money';
import { AmountRow, OrderStatusBadge, OrderTimeline, PageHeader, ServicePage } from '../../services/components/ServicesUi';
import { useOrderChat } from '../../services/hooks/use-order-chat.hook';
import { BUSINESS_STATUS_HINTS } from '../const/business.const';
import { useBusinessOrderDetail } from '../hooks/use-business.hook';

/**
 * Un pedido del negocio: quién lo pidió, qué lleva, adónde va, la acción que toca ahora y la
 * constancia de cada paso (hasta la entrega confirmada con el código del cliente).
 */
export function BusinessOrderDetailView() {
  const d = useBusinessOrderDetail();
  const order = d.order;
  const chat = useOrderChat(order?.id);

  if (!order) {
    return (
      <ServicePage>
        <PageHeader title="Pedido" onBack={d.back} />
        {d.error ? <ErrorState message={d.error} onRetry={d.retry} /> : <ListSkeleton rows={4} />}
      </ServicePage>
    );
  }

  const driverName = order.delivery?.driverName ?? 'el repartidor';
  const delivered = order.timeline.find((t) => t.status === 'delivered');
  return (
    <ServicePage>
      <PageHeader
        title={`Pedido · ${formatSoles(order.totalCents)}`}
        subtitle={`${order.business?.name ?? 'Mi negocio'} · ${formatLongDate(order.createdAt)}`}
        onBack={d.back}
        action={<OrderStatusBadge status={order.status} />}
      />

      {delivered && (
        <section className="flex items-center gap-4 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200 md:p-5 dark:bg-emerald-950/40 dark:ring-emerald-900" aria-label="Entrega confirmada" data-testid="delivery-proof">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white">
            <ShieldCheck className="size-6" />
          </span>
          <div className="min-w-0">
            <p className="font-bold text-ink">Entregado a {order.customer.displayName} · {formatTime(delivered.at)}</p>
            <p className="text-sm text-ink-soft">{delivered.note ?? 'Confirmado con el código del cliente'}</p>
          </div>
        </section>
      )}

      <section className="flex items-center gap-4 rounded-2xl bg-surface p-4 shadow-float md:p-5" aria-label="Cliente">
        <Avatar name={order.customer.displayName} color={order.customer.avatarColor} photo={order.customer.avatarUrl} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-ink">{order.customer.displayName}</p>
          <p className="flex items-start gap-1 text-sm text-ink-soft">
            <MapPin className="mt-0.5 size-3.5 shrink-0" />
            <span className="min-w-0">
              {order.address.line}
              {order.address.reference ? ` · ${order.address.reference}` : ''}
            </span>
          </p>
        </div>
        <Button variant="ghost" icon={<MessageCircle className="size-4" />} onClick={() => chat.open('customer')} loading={chat.opening === 'customer'} data-testid="chat-customer">
          Escribir
        </Button>
      </section>

      {!delivered && (
        <section className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-float md:p-5" aria-label="Qué toca ahora">
          <p className="text-sm text-ink-soft">{BUSINESS_STATUS_HINTS[order.status]}</p>
          {order.status === 'paid' && (
            <div className="flex flex-wrap gap-2">
              <Button icon={<Check className="size-4" />} onClick={d.accept} loading={d.busy === 'accept'} disabled={!!d.busy} data-testid="accept-order">
                Aceptar pedido
              </Button>
              <Button variant="ghost" icon={<X className="size-4" />} onClick={d.askReject} disabled={!!d.busy}>
                Rechazar
              </Button>
            </div>
          )}
          {order.status === 'preparing' && (
            <Button icon={<PackageCheck className="size-4" />} onClick={d.ready} loading={d.busy === 'ready'} data-testid="ready-order" className="self-start">
              Listo · llamar a Rapidito
            </Button>
          )}
          {order.delivery && (
            <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3" data-testid="business-delivery">
              <Bike className="size-5 shrink-0 text-brand" />
              <span className="min-w-0 flex-1 text-sm">
                <span className="block font-semibold text-ink">{order.delivery.driverName}</span>
                <span className="block text-ink-soft">{order.delivery.vehicle}</span>
              </span>
              <Button variant="ghost" size="sm" icon={<MessageCircle className="size-4" />} onClick={() => chat.open('driver')} loading={chat.opening === 'driver'} data-testid="chat-driver">
                Escribir
              </Button>
            </div>
          )}
          {order.status === 'driver_assigned' && (
            <Button icon={<PackageCheck className="size-4" />} onClick={d.handoff} loading={d.busy === 'handoff'} data-testid="handoff-order" className="self-start">
              Le entregué el pedido a {driverName}
            </Button>
          )}
        </section>
      )}

      <section className="flex flex-col gap-2 rounded-2xl bg-surface p-4 shadow-float md:p-5" aria-label="Productos">
        {order.lines.map((line) => (
          <div key={line.productId} className="flex items-baseline justify-between gap-4 text-sm">
            <span className="min-w-0 text-ink">
              <span className="font-semibold">{line.quantity}×</span> {line.name} <span className="text-ink-faint">· {line.unit}</span>
            </span>
            <span className="shrink-0 font-semibold text-ink">{formatSoles(line.totalCents)}</span>
          </div>
        ))}
        <div className="my-1 border-t border-dashed border-line" />
        <AmountRow label="Productos" value={formatSoles(order.subtotalCents)} />
        <AmountRow label="Delivery Rapidito" value={formatSoles(order.deliveryFeeCents)} />
        <AmountRow label="Cobrado al cliente" value={formatSoles(order.totalCents)} strong />
      </section>

      <OrderTimeline entries={order.timeline} />

      <Modal
        open={d.confirmReject}
        onClose={d.cancelReject}
        size="sm"
        title="¿Rechazar este pedido?"
        footer={
          <>
            <Button variant="ghost" onClick={d.cancelReject}>Volver</Button>
            <Button variant="danger" icon={<X className="size-4" />} onClick={d.reject} loading={d.busy === 'reject'}>Rechazar</Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">
          {order.customer.displayName} ya pagó {formatSoles(order.totalCents)}. Escríbele por el chat para explicarle y coordinar la devolución.
        </p>
      </Modal>
    </ServicePage>
  );
}
