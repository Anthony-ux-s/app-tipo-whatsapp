import { Bike, Check, MapPin, MessageCircle, PackageCheck, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { Avatar } from '@shared/ui/Avatar';
import { PrivatePhoto } from '@shared/ui/PrivatePhoto';
import { Stars } from '@shared/ui/Stars';
import { Button } from '@shared/ui/Button';
import { Modal } from '@shared/ui/Modal';
import { ErrorState, ListSkeleton } from '@shared/ui/States';
import { formatTime } from '@shared/utils/date';
import { formatLongDate, formatSoles } from '@shared/utils/money';
import { whatsappLink } from '@shared/utils/big-order';
import { AmountRow, OrderStatusBadge, OrderTimeline, PageHeader, ServicePage } from '../../services/components/ServicesUi';
import { BigOrderTag } from './BigOrderTag';
import { LiveTracking } from '../../services/components/LiveTracking';
import { useOrderChat } from '../../services/hooks/use-order-chat.hook';
import { CLAIM_REASON_LABEL, CLAIM_STATUS_LABEL } from '../../services/const/services.const';
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
        subtitle={`${order.business?.name ?? 'Mi negocio'} · ${formatLongDate(order.createdAt)}${order.big ? ' · GRANDE' : ''}`}
        onBack={d.back}
        action={<OrderStatusBadge status={order.status} />}
      />

      {order.big && order.status === 'paid' && (
        <section className="flex flex-col gap-2 rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-200 md:p-5 dark:bg-rose-950/40 dark:ring-rose-900" aria-label="Pedido grande" data-testid="big-order-alert">
          <p className="flex items-center gap-2 font-bold text-ink">
            <BigOrderTag /> Confírmalo con el cliente antes de prepararlo
          </p>
          <p className="text-sm text-ink-soft">Revisa el stock físico, el tiempo y si hace falta una camioneta. Háblale ahora: el pedido ya está pagado.</p>
        </section>
      )}

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

      {delivered && order.hasDeliveryPhoto && <PrivatePhoto path={`/orders/${encodeURIComponent(order.id)}/delivery-photo`} alt="Foto de la entrega" />}

      {(order.claims ?? []).map((claim) => (
        <section key={claim.id} className="flex flex-col gap-1.5 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200 md:p-5 dark:bg-amber-950/40 dark:ring-amber-900" aria-label="Reclamo del cliente" data-testid="business-claim">
          <p className="flex items-center justify-between gap-3 font-bold text-ink">
            Reclamo · {CLAIM_REASON_LABEL[claim.reason]}
            <span className="shrink-0 text-xs font-bold text-ink-soft">{CLAIM_STATUS_LABEL[claim.status]}</span>
          </p>
          {claim.items.length > 0 && <p className="text-sm text-ink-soft">{claim.items.map((i) => `${i.quantity}× ${i.name}`).join(' · ')}</p>}
          {claim.comment && <p className="text-sm text-ink">«{claim.comment}»</p>}
          {claim.status === 'refunded' && <p className="text-sm text-ink-soft">Soporte le devolvió {formatSoles(claim.refundCents ?? 0)} al cliente.</p>}
          {claim.hasPhoto && <PrivatePhoto path={`/orders/${encodeURIComponent(order.id)}/claims/${encodeURIComponent(claim.id)}/photo`} alt="Foto del reclamo" />}
        </section>
      ))}

      {order.rating?.storeStars && (
        <section className="flex flex-col gap-1 rounded-2xl bg-surface p-4 shadow-float md:p-5" aria-label="Calificación del cliente" data-testid="business-rating">
          <p className="flex items-center justify-between gap-3 font-bold text-ink">
            {order.customer.displayName} calificó a tu tienda <Stars value={order.rating.storeStars} />
          </p>
          {order.rating.comment && <p className="text-sm text-ink-soft">«{order.rating.comment}»</p>}
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
        <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
          <Button variant="ghost" icon={<MessageCircle className="size-4" />} onClick={() => chat.open('customer')} loading={chat.opening === 'customer'} data-testid="chat-customer">
            Escribir
          </Button>
          {order.big && order.customer.phone && (
            <a
              href={whatsappLink(order.customer.phone, `Hola ${order.customer.displayName}, te escribo de ${order.business?.name ?? 'la tienda'} por tu pedido grande en Parla (${formatSoles(order.totalCents)}).`)}
              target="_blank"
              rel="noreferrer"
              data-testid="whatsapp-customer"
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-bold text-ink transition-colors hover:bg-surface-3"
            >
              WhatsApp
            </a>
          )}
        </div>
      </section>

      {(order.status === 'cancelled' || order.status === 'rejected') && (
        <section className="rounded-2xl bg-surface p-4 shadow-float md:p-5" aria-label="Pedido cerrado" data-testid="order-stopped">
          <p className="font-bold text-ink">{order.status === 'rejected' ? 'Rechazaste este pedido' : 'Pedido cancelado'}</p>
          <p className="text-sm text-ink-soft" data-testid="refund">
            {order.payment.refundedAt
              ? `Se le devolvieron ${formatSoles(order.totalCents)} al cliente (${formatTime(order.payment.refundedAt)}).`
              : 'El cliente no había pagado: no hubo cobro.'}
          </p>
        </section>
      )}

      {!delivered && order.status !== 'cancelled' && order.status !== 'rejected' && (
        <section className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-float md:p-5" aria-label="Qué toca ahora">
          <p className="text-sm text-ink-soft">{BUSINESS_STATUS_HINTS[order.status]}</p>
          {order.status === 'paid' && (
            <div className="flex flex-wrap gap-2">
              <Button size="lg" icon={<Check className="size-5" />} onClick={d.accept} loading={d.busy === 'accept'} disabled={!!d.busy} data-testid="accept-order">
                Aceptar pedido
              </Button>
              <Button variant="ghost" icon={<X className="size-4" />} onClick={d.askReject} disabled={!!d.busy}>
                Rechazar
              </Button>
            </div>
          )}
          {order.status === 'preparing' && (
            <Button size="lg" icon={<PackageCheck className="size-5" />} onClick={d.ready} loading={d.busy === 'ready'} data-testid="ready-order">
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
            <div className="flex flex-wrap gap-2">
              <Button size="lg" icon={<PackageCheck className="size-5" />} onClick={d.handoff} loading={d.busy === 'handoff'} disabled={!!d.busy} data-testid="handoff-order">
                Le entregué el pedido a {driverName}
              </Button>
              <Button variant="ghost" icon={<RefreshCw className="size-4" />} onClick={d.reassign} loading={d.busy === 'reassign'} disabled={!!d.busy} data-testid="reassign-order">
                No llega · buscar otro
              </Button>
            </div>
          )}
          {d.canCancel && (
            <Button variant="ghost" size="sm" icon={<X className="size-4" />} onClick={d.askCancel} disabled={!!d.busy} className="self-start" data-testid="business-cancel">
              Cancelar pedido
            </Button>
          )}
        </section>
      )}

      <LiveTracking order={order} audience="business" />

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
        {order.tipCents > 0 && <AmountRow label="Propina (para el repartidor)" value={formatSoles(order.tipCents)} />}
        {order.discountCents > 0 && <AmountRow label={`Cupón ${order.couponCode ?? ''} (lo asume Parla)`} value={`− ${formatSoles(order.discountCents)}`} />}
        <AmountRow label="Cobrado al cliente" value={formatSoles(order.totalCents)} strong />
      </section>

      <OrderTimeline entries={order.timeline} />

      <Modal
        open={d.confirmCancel}
        onClose={d.closeCancel}
        size="sm"
        title="¿Cancelar este pedido?"
        footer={
          <>
            <Button variant="ghost" onClick={d.closeCancel}>Volver</Button>
            <Button variant="danger" icon={<X className="size-4" />} onClick={d.cancel} loading={d.busy === 'cancel'} data-testid="confirm-business-cancel">Cancelar pedido</Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">
          Le devolvemos {formatSoles(order.totalCents)} a {order.customer.displayName}
          {order.delivery?.driverName ? ` y le avisamos a ${order.delivery.driverName} que ya no tiene que recogerlo` : ''}. Escríbele al cliente para explicarle.
        </p>
      </Modal>

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
          {order.customer.displayName} ya pagó {formatSoles(order.totalCents)}: se lo devolvemos a su billetera. Escríbele por el chat para explicarle.
        </p>
      </Modal>
    </ServicePage>
  );
}
