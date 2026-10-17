import { Bike, HandCoins, LocateFixed, MapPin, Minus, Plus, QrCode, ShoppingBasket, Trash2 } from 'lucide-react';
import { Button } from '@shared/ui/Button';
import { Field, FieldError } from '@shared/ui/Field';
import { LazyDeliveryMap } from '@shared/ui/LazyDeliveryMap';
import { EmptyState } from '@shared/ui/States';
import { EmptyChatsIllustration } from '@shared/ui/illustrations';
import { formatSoles } from '@shared/utils/money';
import { useCheckout } from '../hooks/use-checkout.hook';
import { useStoreStatus } from '../hooks/use-store-status.hook';
import { AmountRow, PageHeader, ServicePage, StoreClosedBanner } from './ServicesUi';

/** Carrito → dirección → total (productos + delivery) → pagar con QR. */
export function CheckoutView() {
  const c = useCheckout();
  const store = useStoreStatus('mercado');

  if (c.count === 0) {
    return (
      <ServicePage>
        <PageHeader title="Tu carrito" onBack={c.keepShopping} />
        <EmptyState
          illustration={<EmptyChatsIllustration />}
          title="Tu carrito está vacío"
          description="Busca lo que necesitas en el Mercado y agrégalo."
          action={<Button icon={<ShoppingBasket className="size-4" />} onClick={c.keepShopping}>Ir al Mercado</Button>}
        />
      </ServicePage>
    );
  }

  return (
    <ServicePage>
      <PageHeader title="Tu carrito" subtitle={`${c.count} productos de MercaYa`} onBack={c.keepShopping} />

      <section className="divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-float" aria-label="Productos">
        {c.lines.map(({ product, quantity }) => (
          <div key={product.id} className="flex items-center gap-3 px-4 py-3" data-testid="cart-line">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-ink">{product.name}</p>
              <p className="text-xs text-ink-soft">
                {product.unit} · {formatSoles(product.priceCents)} c/u
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 p-1 dark:bg-teal-950/60">
              <button type="button" onClick={() => c.subtract(product)} aria-label={`Quitar un ${product.name}`} className="inline-flex size-7 items-center justify-center rounded-full text-brand hover:bg-white dark:text-teal-300 dark:hover:bg-teal-900">
                <Minus className="size-4" />
              </button>
              <span className="min-w-5 text-center text-sm font-bold text-ink">{quantity}</span>
              <button type="button" onClick={() => c.add(product)} aria-label={`Agregar otro ${product.name}`} className="inline-flex size-7 items-center justify-center rounded-full text-brand hover:bg-white dark:text-teal-300 dark:hover:bg-teal-900">
                <Plus className="size-4" />
              </button>
            </span>
            <button type="button" onClick={() => c.remove(product.id)} aria-label={`Sacar ${product.name} del carrito`} className="inline-flex size-9 items-center justify-center rounded-full text-ink-faint hover:bg-surface-3 hover:text-ink">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-float md:p-5" aria-label="Dirección de entrega">
        <h2 className="flex items-center gap-2 text-base font-bold text-ink">
          <MapPin className="size-5 text-brand dark:text-teal-300" /> ¿A dónde lo llevamos?
        </h2>
        <Field label="Dirección" placeholder="ej. Av. Larco 123, Miraflores" value={c.address.line} maxLength={200} onChange={(e) => c.onAddressChange(e.target.value)} />
        <Field label="Referencia" placeholder="ej. Puerta verde, 3er piso" value={c.address.reference} maxLength={200} onChange={(e) => c.onReferenceChange(e.target.value)} />
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-ink-soft">
              {c.address.location ? 'Punto de entrega marcado. Arrástralo o toca otro lugar para corregirlo.' : 'Toca el mapa para marcar dónde te entregamos (opcional, ayuda al repartidor).'}
            </p>
            <Button variant="ghost" size="sm" icon={<LocateFixed className="size-4" />} onClick={c.useMyLocation} loading={c.locating} data-testid="use-my-location">
              Usar mi ubicación
            </Button>
          </div>
          <LazyDeliveryMap destination={c.address.location} onPick={c.onPickLocation} label="Mapa para marcar el punto de entrega" />
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-float md:p-5" aria-label="Propina">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            <HandCoins className="size-5 text-brand dark:text-teal-300" /> Propina para tu repartidor
          </h2>
          <p className="text-sm text-ink-soft">Opcional. Va completa al repartidor que te lleve el pedido.</p>
        </div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Propina">
          {c.tipOptions.map((cents) => (
            <button
              key={cents}
              type="button"
              role="radio"
              aria-checked={!c.customTip && c.tipCents === cents}
              onClick={() => c.selectTip(cents)}
              className={`h-10 rounded-full px-4 text-sm font-semibold transition-colors duration-200 ${!c.customTip && c.tipCents === cents ? 'bg-brand text-white' : 'bg-surface-3 text-ink-soft hover:text-ink'}`}
            >
              {cents === 0 ? 'Sin propina' : formatSoles(cents)}
            </button>
          ))}
          <label className="flex h-10 items-center gap-1 rounded-full bg-surface-3 px-3 text-sm text-ink-soft focus-within:ring-2 focus-within:ring-teal-500/40">
            S/
            <input
              inputMode="decimal"
              value={c.customTip}
              onChange={(e) => c.onCustomTip(e.target.value)}
              placeholder="Otro"
              aria-label="Otra propina en soles"
              className="w-16 bg-transparent font-semibold text-ink outline-none placeholder:text-ink-faint"
            />
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-2xl bg-surface p-4 shadow-float md:p-5" aria-label="Resumen" data-testid="quote">
        {!c.addressReady ? (
          <p className="text-sm text-ink-soft">Escribe la dirección para calcular el delivery y el total.</p>
        ) : c.quoteError ? (
          <FieldError message={c.quoteError} />
        ) : !c.quote ? (
          <p className="text-sm text-ink-soft">Consultando precios en la tienda y la tarifa del delivery…</p>
        ) : (
          <>
            <AmountRow label="Productos" value={formatSoles(c.quote.subtotalCents)} />
            <AmountRow label="Delivery Rapidito" value={formatSoles(c.quote.deliveryFeeCents)} />
            {c.quote.tipCents > 0 && <AmountRow label="Propina para el repartidor" value={formatSoles(c.quote.tipCents)} />}
            <div className="my-1 border-t border-dashed border-line" />
            <AmountRow label="Total a pagar" value={formatSoles(c.quote.totalCents)} strong />
            <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-soft">
              <Bike className="size-4" /> Llega en unos {c.quote.etaMinutes} minutos después de pagar.
            </p>
          </>
        )}
      </section>

      <StoreClosedBanner status={store.status} />
      <Button fullWidth size="lg" icon={<QrCode className="size-5" />} loading={c.placing} disabled={!c.canPay || store.closed} onClick={c.pay}>
        {c.quote ? `Pagar ${formatSoles(c.quote.totalCents)} con QR` : 'Pagar con QR'}
      </Button>
    </ServicePage>
  );
}
