import { Bike, Check, ChefHat, ExternalLink, KeyRound, MapPin, MessageCircle, PackageCheck, ShoppingBasket, Smartphone, Store } from 'lucide-react';
import { Button } from '@shared/ui/Button';
import { QrCode } from '@shared/ui/QrCode';
import { ErrorState, ListSkeleton } from '@shared/ui/States';
import { formatLongDate, formatSoles } from '@shared/utils/money';
import { ORDER_STEPS } from '../const/services.const';
import { useOrderChat } from '../hooks/use-order-chat.hook';
import { useOrderDetail } from '../hooks/use-orders.hook';
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
            <p className="text-xs text-ink-soft">Dáselo al repartidor solo cuando tengas tu pedido en la mano.</p>
          </div>
        </section>
      )}

      {(order.status === 'searching_driver' || order.delivery) && (
        <section className="flex items-center gap-4 rounded-2xl bg-surface p-4 shadow-float md:p-5" aria-label="Delivery" data-testid="delivery-card">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-600 to-cyan-700 text-white">
            {order.status === 'delivered' ? <PackageCheck className="size-6" /> : <Bike className="size-6" />}
          </span>
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
          </div>
          {order.delivery && order.status !== 'delivered' && (
            <Button variant="ghost" icon={<MessageCircle className="size-4" />} onClick={() => chat.open('driver')} loading={chat.opening === 'driver'} data-testid="chat-driver">
              Escribir
            </Button>
          )}
        </section>
      )}

      {stopped && (
        <section className="rounded-2xl bg-surface p-5 text-center shadow-float">
          {order.status === 'rejected' ? (
            <>
              <p className="font-bold text-ink">{businessName} no aceptó este pedido</p>
              <p className="mt-1 text-sm text-ink-soft">Escríbele para coordinar la devolución de tu pago o arma otro pedido.</p>
            </>
          ) : (
            <>
              <p className="font-bold text-ink">El cobro venció sin pagarse</p>
              <p className="mt-1 text-sm text-ink-soft">No se te cobró nada. Puedes volver a hacer el pedido cuando quieras.</p>
            </>
          )}
          <Button className="mt-4" icon={<ShoppingBasket className="size-4" />} onClick={d.shopAgain}>
            Volver al Mercado
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
        <AmountRow label="Total" value={formatSoles(order.totalCents)} strong />
        <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-soft">
          <MapPin className="mt-0.5 size-3.5 shrink-0" />
          {order.address.line}
          {order.address.reference ? ` · ${order.address.reference}` : ''}
        </p>
      </section>

      {order.timeline.length > 1 && <OrderTimeline entries={order.timeline} />}
    </ServicePage>
  );
}
