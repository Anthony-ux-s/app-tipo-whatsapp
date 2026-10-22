import type { ReactNode } from 'react';
import { ForYouSection } from '../../growth/components/ForYouSection';
import { useForYou } from '../../growth/hooks/use-for-you.hook';
import { ProfileButton } from '@shared/ui/ProfileButton';
import { EmptyState, ErrorState } from '@shared/ui/States';
import { NoResultsIllustration } from '@shared/ui/illustrations';
import { OFFER_CATEGORY_INFO, type OfferCategory } from '../const/offers.const';
import { useOffers } from '../hooks/use-offers.hook';
import { ProductCard } from './ProductCard';
import { CartBar, PageHeader, ServicePage } from './ServicesUi';

/** Ofertas: los productos rebajados de las tiendas de Mercado, que se compran aquí mismo. */
export function OffersView() {
  const o = useOffers();
  const forYou = useForYou(o.catalog);
  return (
    <ServicePage footer={<CartBar count={o.count} estimateCents={o.estimate} onOpen={o.goToCart} />}>
      <PageHeader title="Ofertas" subtitle="Lo más rebajado de la semana." action={<ProfileButton />} />

      <ForYouSection
        forYou={forYou}
        render={(product) => (
          <ProductCard key={`${o.storeOf(product)?.id}-${product.id}`} product={product} storeName={o.storeOf(product)?.name} quantity={o.quantityOf(product)} onAdd={() => o.add(product)} onSubtract={() => o.subtract(product)} />
        )}
      />

      <OfferSection category="mercado">
        {o.error ? (
          <ErrorState message={o.error} onRetry={o.retry} />
        ) : o.loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-60 animate-pulse rounded-2xl bg-surface-3" />
            ))}
          </div>
        ) : o.offers.length === 0 ? (
          <EmptyState compact illustration={<NoResultsIllustration />} title="Sin ofertas por ahora" description="Las tiendas de Mercado no tienen productos rebajados hoy." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {o.offers.map((product) => (
              <ProductCard key={`${o.storeOf(product)?.id}-${product.id}`} product={product} storeName={o.storeOf(product)?.name} quantity={o.quantityOf(product)} onAdd={() => o.add(product)} onSubtract={() => o.subtract(product)} />
            ))}
          </div>
        )}
      </OfferSection>
    </ServicePage>
  );
}

function OfferSection({ category, children }: { category: OfferCategory; children: ReactNode }) {
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
      </header>
      {children}
    </section>
  );
}
