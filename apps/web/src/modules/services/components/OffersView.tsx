import { Clock } from 'lucide-react';
import type { ReactNode } from 'react';
import { ProfileButton } from '@shared/ui/ProfileButton';
import { EmptyState, ErrorState } from '@shared/ui/States';
import { NoResultsIllustration } from '@shared/ui/illustrations';
import { formatSoles } from '@shared/utils/money';
import { OFFER_CATEGORY_INFO, OFFER_TABS, type OfferCategory, type ShowcaseOffer } from '../const/offers.const';
import { useOffers } from '../hooks/use-offers.hook';
import { discountPercent } from '../utils/services.utils';
import { ProductCard } from './ProductCard';
import { useStoreStatus } from '../hooks/use-store-status.hook';
import { CartBar, PageHeader, ServicePage, StoreClosedBanner } from './ServicesUi';

/** Ofertas de todos los servicios: Mercado (se compran aquí mismo), restaurantes y salud. */
export function OffersView() {
  const o = useOffers();
  const store = useStoreStatus('mercado');
  return (
    <ServicePage footer={<CartBar count={o.count} estimateCents={o.estimate} onOpen={o.goToCart} />}>
      <PageHeader title="Ofertas" subtitle="Lo más rebajado de la semana en todos los servicios." action={<ProfileButton />} />

      <div className="-mt-2 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Filtrar ofertas">
        {OFFER_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={o.tab === t.id}
            onClick={() => o.selectTab(t.id)}
            className={`h-9 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors duration-200 ${o.tab === t.id ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200' : 'bg-surface text-ink-soft shadow-float hover:text-ink'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {o.shows('mercado') && (
        <OfferSection category="mercado">
          <StoreClosedBanner status={store.status} />
          {o.error ? (
            <ErrorState message={o.error} onRetry={o.retry} />
          ) : o.marketLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="h-60 animate-pulse rounded-2xl bg-surface-3" />
              ))}
            </div>
          ) : o.marketOffers.length === 0 ? (
            <EmptyState compact illustration={<NoResultsIllustration />} title="Sin ofertas por ahora" description="MercaYa no tiene productos rebajados hoy." />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {o.marketOffers.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  quantity={o.quantityOf(product.id)}
                  onAdd={() => o.add(product)}
                  onSubtract={() => o.subtract(product)}
                />
              ))}
            </div>
          )}
        </OfferSection>
      )}

      {o.shows('restaurantes') && (
        <OfferSection category="restaurantes" comingSoon>
          <ShowcaseList offers={o.restaurantOffers} />
        </OfferSection>
      )}

      {o.shows('salud') && (
        <OfferSection category="salud" comingSoon>
          <ShowcaseList offers={o.healthOffers} />
        </OfferSection>
      )}
    </ServicePage>
  );
}

function OfferSection({ category, comingSoon = false, children }: { category: OfferCategory; comingSoon?: boolean; children: ReactNode }) {
  const info = OFFER_CATEGORY_INFO[category];
  const Icon = info.icon;
  return (
    <section aria-label={`Ofertas de ${info.title}`} data-testid={`offers-${category}`} className="flex flex-col gap-3">
      <header className="flex items-center gap-3 px-1">
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white ${info.gradient}`}>
          <Icon className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-ink">{info.title}</span>
          <span className="block truncate text-xs text-ink-soft">{info.subtitle}</span>
        </span>
        {comingSoon && <span className="shrink-0 rounded-full bg-surface-3 px-2 py-1 text-[11px] font-bold text-ink-soft">Pedidos muy pronto</span>}
      </header>
      {children}
    </section>
  );
}

/** Ofertas de servicios sin sistema conectado todavía: se ven, pero no se pueden pedir. */
function ShowcaseList({ offers }: { offers: ShowcaseOffer[] }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-float">
      {offers.map((offer) => {
        const Icon = offer.icon;
        const discount = discountPercent(offer.priceCents, offer.listPriceCents);
        return (
          <li key={offer.id} data-testid="showcase-offer" className="flex items-center gap-3 px-4 py-3 md:px-5">
            <span className="relative flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-ink-soft">
              <Icon className="size-6" />
              <span className="absolute -top-1.5 -right-1.5 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white">-{discount} %</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold text-ink">{offer.title}</span>
              <span className="block truncate text-xs text-ink-soft">
                {offer.merchant} · {offer.detail}
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end">
              <span className="font-extrabold whitespace-nowrap text-rose-700 dark:text-rose-400">{formatSoles(offer.priceCents)}</span>
              <span className="text-xs whitespace-nowrap text-ink-faint line-through" aria-label={`Antes ${formatSoles(offer.listPriceCents)}`}>
                {formatSoles(offer.listPriceCents)}
              </span>
              <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-ink-faint">
                <Clock className="size-3" /> Pronto
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
