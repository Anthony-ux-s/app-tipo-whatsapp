import { Check, ChefHat, Clock, ExternalLink, KeyRound, MapPin, MessageCircle, RefreshCw, RotateCcw, Smartphone, Store, X } from 'lucide-react';
import { Button } from '@shared/ui/Button';
import { Modal } from '@shared/ui/Modal';
import { PrivatePhoto } from '@shared/ui/PrivatePhoto';
import { QrCode } from '@shared/ui/QrCode';
import { ErrorState, ListSkeleton } from '@shared/ui/States';
import { formatTime } from '@shared/utils/date';
import { formatLongDate, formatSoles } from '@shared/utils/money';
import { ORDER_STEPS } from '../const/services.const';
import { useOrderChat } from '../hooks/use-order-chat.hook';
import { useOrderDetail } from '../hooks/use-orders.hook';
import { useReorder } from '../hooks/use-reorder.hook';
import { LiveTracking } from './LiveTracking';
import { ClaimCard } from './ClaimCard';
import { RateOrderCard } from './RateOrderCard';
import { ServiceIcon } from './ServiceIcons';
import { AmountRow, OrderStatusBadge, OrderTimeline, PageHeader, ServicePage } from './ServicesUi';

/**
 * Un pedido: QR para pagar mientras espera; luego la tienda lo acepta y lo prepara, un repartidor de
 * Rapidito lo recoge y lo trae, todo en vivo. Al recibirlo, el cliente le dicta su código de entrega.
 * Desde aquí se le escribe a la tienda o al repartidor.
 */
export function OrderDetailView() {
  const d = useOrderDetail();
  const order = d.order;
  const chat = useOrderChat(order?.id);
  const again = useReorder();

  if (!order) {
    return (
      <ServicePage>
        <PageHeader title="Pedido" onBack={d.back} />
        {d.error ? <ErrorState message={d.error} onRetry={d.retry} /> : <ListSkeleton rows={4} />}
      </ServicePage>
    );
  }

  const stopped = order.status === 'payment_expired' || order.status === 'cancelled' || order.status === 'rejected';
  const businessName = order.business?.name ?? 'El negocio';
  return (
    <ServicePage>
      <PageHeader
        title={`Pedido · ${formatSoles(order.totalCents)}`}
        subtitle={`Mercado · ${formatLongDate(order.createdAt)}`}
        onBack={d.back}
        action={<OrderStatusBadge status={order.status} />}
      />

      {!stopped && (
        <ol className="grid grid-cols-5 gap-1 rounded-2xl bg-surface p-4 shadow-float" aria-label="Seguimiento del pedido">
          {ORDER_STEPS.map((step, index) => {
            const done = index < d.step || order.status === 'delivered';
            const current = index === d.step && order.status !== 'delivered';
            return (
              <li key={step.status} className="flex flex-col items-center gap-1.5 text-center">
                <span
                  className={`flex size-9 items-center justify-center rounded-full text-sm font-bold transition-colors duration-300 ${done ? 'bg-brand text-white' : current ? 'bg-teal-100 text-teal-900 ring-2 ring-teal-500 dark:bg-teal-900/60 dark:text-teal-100' : 'bg-surface-3 text-ink-faint'}`}
                >
                  {done ? <Check className="size-4" /> : index + 1}
                </span>
                <span className={`text-[11px] font-semibold ${done || current ? 'text-ink' : 'text-ink-faint'}`}>{step.label}</span>
              </li>
            );
          })}
        </ol>
      )}

      {order.status === 'pending_payment' && (
        <section className="flex flex-col items-center gap-4 rounded-2xl bg-surface p-5 text-center shadow-float md:p-6" aria-label="Pagar con QR">
          <div>
            <p className="text-sm font-semibold text-ink-soft">Escanea con tu billetera para pagar</p>
            <p className="text-3xl font-extrabold text-ink">{formatSoles(order.totalCents)}</p>
          </div>
          <div className="rounded-2xl bg-white p-3 shadow-float ring-1 ring-line">
            <QrCode value={order.payment.qrText} label={`Código QR para pagar ${formatSoles(order.totalCents)}`} className="size-56 md:size-64" />
          </div>
          <p className="text-xs text-ink-soft">
            Cobro de {order.payment.provider} · vence en {d.minutesToPay} min
          </p>
          <a
            href={order.payment.payUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="pay-link"
            className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-card)] bg-brand px-5 font-semibold text-white transition-colors duration-200 hover:bg-brand-strong"
          >
            <Smartphone className="size-4" /> Pagar desde este celular <ExternalLink className="size-4" />
          </a>
          <p className="max-w-sm text-xs text-ink-faint">Apenas pagues, esta pantalla se actualiza sola y {businessName} recibe tu pedido.</p>
        </section>
      )}

      {order.business && order.status !== 'pending_payment' && order.status !== 'payment_expired' && (
        <section className="flex items-center gap-4 rounded-2xl bg-surface p-4 shadow-float md:p-5" aria-label="Negocio" data-testid="business-card">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white">
            {order.status === 'preparing' ? <ChefHat className="size-6" /> : <Store className="size-6" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-ink">
              {order.status === 'paid'
                ? `${businessName} está revisando tu pedido`
                : order.status === 'preparing'
                  ? `${businessName} está preparando tu pedido`
                  : order.status === 'rejected'
                    ? `${businessName} no pudo aceptar tu pedido`
                    : businessName}
            </p>
            <p className="text-sm text-ink-soft">
              {order.status === 'paid' ? 'Te avisamos apenas lo acepte.' : order.status === 'preparing' ? 'Un repartidor de Rapidito lo recogerá cuando esté listo.' : '¿Dudas sobre tu pedido? Escríbele.'}
            </p>
          </div>
          <Button variant="ghost" icon={<MessageCircle className="size-4" />} onClick={() => chat.open('business')} loading={chat.opening === 'business'} data-testid="chat-business">
            Escribir
          </Button>
        </section>
      )}

      {order.deliveryCode && order.status !== 'delivered' && (
        <section className="flex items-center gap-4 rounded-2xl border-2 border-dashed border-teal-300 bg-teal-50 p-4 md:p-5 dark:border-teal-800 dark:bg-teal-950/40" aria-label="Código de entrega">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand text-white">
            <KeyRound className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-soft">Tu código de entrega</p>
            <p className="font-mono text-3xl font-extrabold tracking-[0.3em] text-ink" data-testid="delivery-code">{order.deliveryCode}</p>
            {order.deliveryCodeLocked ? (
              <p className="text-xs font-semibold text-rose-700 dark:text-rose-400">Se bloqueó: alguien probó códigos equivocados. Genera uno nuevo y díctaselo en persona.</p>
            ) : (
              <p className="text-xs text-ink-soft">Dáselo al repartidor solo cuando tengas tu pedido en la mano.</p>
            )}
          </div>
          {order.deliveryCodeLocked && (
            <Button variant="secondary" icon={<RefreshCw className="size-4" />} onClick={d.renewCode} loading={d.busy === 'renew'} data-testid="renew-code">
              Código nuevo
            </Button>
          )}
        </section>
      )}

      {(order.status === 'searching_driver' || order.delivery) && (
        <section className="flex items-center gap-4 rounded-2xl bg-surface p-4 shadow-float md:p-5" aria-label="Delivery" data-testid="delivery-card">
          <ServiceIcon name={order.status === 'delivered' ? 'pedidos' : 'rapidito'} className="size-12 shrink-0 drop-shadow-[0_4px_8px_rgba(15,23,42,0.18)]" />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-ink">
              {order.status === 'delivered'
                ? `¡Entregado${order.delivery?.driverName ? ` por ${order.delivery.driverName}` : ''}!`
                : order.status === 'searching_driver'
                  ? 'Buscando un repartidor de Rapidito…'
                  : order.status === 'driver_assigned'
                    ? `${order.delivery?.driverName ?? 'Tu repartidor'} va a recoger tu pedido`
                    : `${order.delivery?.driverName ?? 'Tu repartidor'} lleva tu pedido`}
            </p>
            <p className="text-sm text-ink-soft">
              Rapidito
              {order.delivery?.vehicle ? ` · ${order.delivery.vehicle}` : ''}
            </p>
            {d.eta && !order.driverLocation && (
              <p className="mt-0.5 flex items-center gap-1 text-sm font-semibold text-brand dark:text-teal-300" data-testid="eta">
                <Clock className="size-3.5" /> Llega aprox. a las {formatTime(d.eta)}
              </p>
            )}
          </div>
          {order.delivery && order.status !== 'delivered' && (
            <Button variant="ghost" icon={<MessageCircle className="size-4" />} onClick={() => chat.open('driver')} loading={chat.opening === 'driver'} data-testid="chat-driver">
              Escribir
            </Button>
          )}
        </section>
      )}

      {order.status === 'delivered' && order.hasDeliveryPhoto && (
        <section className="flex flex-col gap-2 rounded-2xl bg-surface p-4 shadow-float md:p-5" aria-label="Foto de la entrega" data-testid="delivery-photo">
          <p className="text-sm font-bold text-ink">
            {order.deliveredWithoutCode ? 'No pudimos ubicarte: el repartidor dejó tu pedido y tomó esta foto' : 'Foto de la entrega'}
          </p>
          <PrivatePhoto path={`/orders/${encodeURIComponent(order.id)}/delivery-photo`} alt="Foto de la entrega" />
        </section>
      )}

      <LiveTracking order={order} audience="customer" />
      <RateOrderCard order={order} />
      <ClaimCard order={order} />
      {order.status === 'delivered' && (
        <Button variant="secondary" className="self-center" icon={<RotateCcw className="size-4" />} onClick={() => void again.reorder(order)} loading={again.loading} data-testid="reorder">
          Volver a pedir
        </Button>
      )}

      {d.canCancel && (
        <Button variant="ghost" className="self-center" icon={<X className="size-4" />} onClick={d.askCancel} data-testid="cancel-order">
          Cancelar pedido
        </Button>
      )}

      {stopped && (
        <section className="rounded-2xl bg-surface p-5 text-center shadow-float" data-testid="order-stopped">
          {order.status === 'rejected' || order.status === 'cancelled' ? (
            <>
              <p className="font-bold text-ink">
                {order.status === 'rejected' ? `${businessName} no aceptó este pedido` : 'Pedido cancelado'}
              </p>
              <p className="mt-1 text-sm text-ink-soft" data-testid="refund">
                {order.payment.refundedAt
                  ? `Te devolvimos ${formatSoles(order.totalCents)} a tu billetera ${order.payment.provider} (${formatTime(order.payment.refundedAt)}).`
                  : order.payment.paidAt
                    ? 'Estamos devolviendo tu pago.'
                    : 'No se te cobró nada.'}
              </p>
            </>
          ) : (
            <>
              <p className="font-bold text-ink">El cobro venció sin pagarse</p>
              <p className="mt-1 text-sm text-ink-soft">No se te cobró nada. Puedes volver a hacer el pedido cuando quieras.</p>
            </>
          )}
          <Button className="mt-4" icon={<RotateCcw className="size-4" />} onClick={() => void again.reorder(order)} loading={again.loading} data-testid="reorder">
            Volver a pedir
          </Button>
        </section>
      )}

      <section className="flex flex-col gap-2 rounded-2xl bg-surface p-4 shadow-float md:p-5" aria-label="Detalle">
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
        <AmountRow label="Delivery" value={formatSoles(order.deliveryFeeCents)} />
        {order.tipCents > 0 && <AmountRow label="Propina para el repartidor" value={formatSoles(order.tipCents)} />}
        {order.discountCents > 0 && <AmountRow label={`Cupón ${order.couponCode ?? ''}`} value={`− ${formatSoles(order.discountCents)}`} />}
        <AmountRow label="Total" value={formatSoles(order.totalCents)} strong />
        <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-soft">
          <MapPin className="mt-0.5 size-3.5 shrink-0" />
          {order.address.line}
          {order.address.reference ? ` · ${order.address.reference}` : ''}
        </p>
      </section>

      {order.timeline.length > 1 && <OrderTimeline entries={order.timeline} />}

      <Modal
        open={d.confirmCancel}
        onClose={d.closeCancel}
        size="sm"
        title="¿Cancelar el pedido?"
        footer={
          <>
            <Button variant="ghost" onClick={d.closeCancel}>Volver</Button>
            <Button variant="danger" icon={<X className="size-4" />} onClick={d.cancel} loading={d.busy === 'cancel'} data-testid="confirm-cancel">
              Cancelar pedido
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">
          {order.status === 'paid'
            ? `${businessName} todavía no lo aceptó. Te devolvemos ${formatSoles(order.totalCents)} a tu billetera.`
            : 'Anulamos el cobro: el QR deja de servir y no se te cobra nada.'}
        </p>
      </Modal>
    </ServicePage>
  );
}
