import { Bike, HandCoins, LocateFixed, MapPin, Minus, Plus, QrCode, ShoppingBasket, Tag, Trash2, X } from 'lucide-react';
import { Button } from '@shared/ui/Button';
import { Field, FieldError } from '@shared/ui/Field';
import { LazyDeliveryMap } from '@shared/ui/LazyDeliveryMap';
import { PlaceSearch } from '@shared/ui/PlaceSearch';
import { EmptyState } from '@shared/ui/States';
import { EmptyChatsIllustration } from '@shared/ui/illustrations';
import { formatDistance } from '@shared/utils/geo';
import { formatSoles } from '@shared/utils/money';
import { useCheckout } from '../hooks/use-checkout.hook';
import { useStoreStatus } from '../hooks/use-store-status.hook';
import { AmountRow, PageHeader, ServicePage, StoreClosedBanner } from './ServicesUi';
import { ProductImage } from './ProductImage';
import { SERVICE_VISUALS } from '../const/services.const';
import { useStore } from '../hooks/use-stores.hook';
import { isBigOrder } from '@shared/utils/big-order';
import { BigOrderNotice } from './BigOrderNotice';
import { SavedAddresses } from './SavedAddresses';

/** Carrito → dirección → total (productos + delivery) → pagar con QR. */
export function CheckoutView() {
  const c = useCheckout();
  const store = useStoreStatus(c.service);
  const { store: info } = useStore(c.service);
  const storeName = info?.name ?? 'la tienda';
  const emptyText = info ? SERVICE_VISUALS[info.service].empty : 'Busca lo que necesitas y agrégalo.';

  if (c.count === 0) {
    return (
      <ServicePage>
        <PageHeader title="Tu carrito" onBack={c.keepShopping} />
        <EmptyState
          illustration={<EmptyChatsIllustration />}
          title="Tu carrito está vacío"
          description={emptyText}
          action={<Button icon={<ShoppingBasket className="size-4" />} onClick={c.keepShopping}>{c.service ? `Ir a ${storeName}` : 'Ver tiendas'}</Button>}
        />
      </ServicePage>
    );
  }

  return (
    <ServicePage>
      <PageHeader title="Tu carrito" subtitle={`${c.count} productos de ${storeName}`} onBack={c.keepShopping} />

      <section className="divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-float" aria-label="Productos">
        {c.lines.map(({ product, quantity }) => (
          <div key={product.id} className="flex items-center gap-3 px-4 py-3" data-testid="cart-line">
            <span className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-950/60 dark:to-cyan-950/60">
              <ProductImage name={product.name} category={product.category} imageUrl={product.imageUrl} className="size-9" />
            </span>
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
        <SavedAddresses current={c.address} onPick={c.pickAddress} />
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
          <PlaceSearch onSelect={c.onPlaceFound} placeholder="Busca tu dirección para ubicarla en el mapa" />
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
              className="w-16 bg-transparent font-semibold text-ink outline-none placeholder:text-ink-faint/60"
            />
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-2xl bg-surface p-4 shadow-float md:p-5" aria-label="Cupón">
        <h2 className="flex items-center gap-2 text-base font-bold text-ink">
          <Tag className="size-5 text-brand dark:text-teal-300" /> ¿Tienes un cupón?
        </h2>
        {c.couponCode && c.quote?.coupon ? (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-emerald-50 px-3 py-2.5 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:ring-emerald-900" data-testid="coupon-applied">
            <p className="min-w-0 text-sm text-ink">
              <span className="font-bold">{c.quote.coupon.code}</span> · {c.quote.coupon.description}
            </p>
            <button type="button" onClick={c.removeCoupon} aria-label="Quitar cupón" className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-white hover:text-ink dark:hover:bg-emerald-900">
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <>
          {c.myCoupons.length > 0 && (
            <ul className="flex flex-col gap-2" aria-label="Tus cupones" data-testid="my-coupons">
              {c.myCoupons.map((m) => (
                <li key={m.code}>
                  <button
                    type="button"
                    onClick={() => c.useMyCoupon(m.code)}
                    disabled={m.missingCents > 0}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-dashed border-teal-400 bg-teal-50 px-3 py-2.5 text-left transition-colors enabled:hover:bg-teal-100 disabled:border-line disabled:bg-surface-3 dark:bg-teal-950/40 dark:enabled:hover:bg-teal-900/50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-ink">{m.description}</span>
                      <span className="block font-mono text-xs text-ink-soft">
                        {m.code}
                        {m.missingCents > 0 ? ` · agrega ${formatSoles(m.missingCents)} más para usarlo` : ''}
                      </span>
                    </span>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${m.missingCents > 0 ? 'bg-surface text-ink-faint' : 'bg-brand text-white'}`}>{m.missingCents > 0 ? 'Aún no' : 'Usar'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex items-start gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              c.applyCoupon();
            }}
          >
            <Field label="Código" placeholder="ej. BIENVENIDA" value={c.couponDraft} onChange={(e) => c.onCouponDraft(e.target.value)} error={c.couponError} autoCapitalize="characters" className="flex-1" data-testid="coupon-input" />
            <Button type="submit" variant="secondary" className="mt-7" loading={!!c.couponCode && c.quoting} data-testid="apply-coupon">
              Aplicar
            </Button>
          </form>
          </>
        )}
      </section>

      {c.quote && info && isBigOrder({ totalCents: c.quote.totalCents, units: c.lines.reduce((sum, l) => sum + l.quantity, 0) }, info.bigOrder) && (
        <BigOrderNotice
          rules={info.bigOrder}
          storeName={storeName}
          stage="quote"
          summary={`Hola, quiero confirmar un pedido grande por Parla: ${c.lines.map((l) => `${l.quantity}× ${l.product.name}`).join(', ')}. Total ${formatSoles(c.quote.totalCents)}.`}
        />
      )}

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
            <AmountRow label={c.quote.distanceKm ? `Delivery Rapidito · ${formatDistance(c.quote.distanceKm)}` : 'Delivery Rapidito'} value={formatSoles(c.quote.deliveryFeeCents)} />
            {c.quote.tipCents > 0 && <AmountRow label="Propina para el repartidor" value={formatSoles(c.quote.tipCents)} />}
            {c.quote.discountCents > 0 && <AmountRow label={`Cupón ${c.quote.coupon?.code ?? ''}`} value={`− ${formatSoles(c.quote.discountCents)}`} />}
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
