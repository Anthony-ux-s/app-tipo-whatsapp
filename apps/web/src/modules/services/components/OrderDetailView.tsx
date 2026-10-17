import { Bike, Check, ExternalLink, MapPin, PackageCheck, ShoppingBasket, Smartphone } from 'lucide-react';
import { Button } from '@shared/ui/Button';
import { QrCode } from '@shared/ui/QrCode';
import { ErrorState, ListSkeleton } from '@shared/ui/States';
import { formatLongDate, formatSoles } from '@shared/utils/money';
import { ORDER_STEPS } from '../const/services.const';
import { useOrderDetail } from '../hooks/use-orders.hook';
import { AmountRow, OrderStatusBadge, PageHeader, ServicePage } from './ServicesUi';

/** Un pedido: QR para pagar mientras espera, y el seguimiento del delivery en vivo después. */
export function OrderDetailView() {
  const d = useOrderDetail();
  const order = d.order;

  if (!order) {
    return (
      <ServicePage>
        <PageHeader title="Pedido" onBack={d.back} />
        {d.error ? <ErrorState message={d.error} onRetry={d.retry} /> : <ListSkeleton rows={4} />}
      </ServicePage>
    );
  }

  const stopped = order.status === 'payment_expired' || order.status === 'cancelled';
  return (
    <ServicePage>
      <PageHeader
        title={`Pedido · ${formatSoles(order.totalCents)}`}
        subtitle={`Mercado · ${formatLongDate(order.createdAt)}`}
        onBack={d.back}
        action={<OrderStatusBadge status={order.status} />}
      />

      {!stopped && (
        <ol className="grid grid-cols-4 gap-1 rounded-2xl bg-surface p-4 shadow-float" aria-label="Seguimiento del pedido">
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
          <p className="max-w-sm text-xs text-ink-faint">Apenas pagues, esta pantalla se actualiza sola y despachamos tu pedido.</p>
        </section>
      )}

      {order.delivery && (
        <section className="flex items-center gap-4 rounded-2xl bg-surface p-4 shadow-float md:p-5" aria-label="Delivery" data-testid="delivery-card">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-600 to-cyan-700 text-white">
            {order.status === 'delivered' ? <PackageCheck className="size-6" /> : <Bike className="size-6" />}
          </span>
          <div className="min-w-0">
            <p className="font-bold text-ink">
              {order.status === 'delivered'
                ? `¡Entregado${order.delivery.driverName ? ` por ${order.delivery.driverName}` : ''}!`
                : order.delivery.driverName
                  ? `${order.delivery.driverName} lleva tu pedido`
                  : 'Buscando un motorizado cerca…'}
            </p>
            <p className="text-sm text-ink-soft">
              {order.delivery.provider}
              {order.delivery.vehicle ? ` · ${order.delivery.vehicle}` : ''}
              {order.delivery.etaMinutes && order.status !== 'delivered' ? ` · llega en ~${order.delivery.etaMinutes} min` : ''}
            </p>
          </div>
        </section>
      )}

      {stopped && (
        <section className="rounded-2xl bg-surface p-5 text-center shadow-float">
          <p className="font-bold text-ink">El cobro venció sin pagarse</p>
          <p className="mt-1 text-sm text-ink-soft">No se te cobró nada. Puedes volver a hacer el pedido cuando quieras.</p>
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
    </ServicePage>
  );
}
