import type { ServiceId, StoreSummary } from '@parla/types';
import { ChevronRight, Clock, MapPin, Moon, Star } from 'lucide-react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { EmptyState, ErrorState } from '@shared/ui/States';
import { NoResultsIllustration } from '@shared/ui/illustrations';
import { isServiceId, SERVICE_VISUALS } from '../const/services.const';
import { useStoreList } from '../hooks/use-stores.hook';
import { PageHeader, ServicePage } from './ServicesUi';

/** Las tiendas de una categoría: se elige una para ver su catálogo. */
export function StoresListView() {
  const { category } = useParams();
  if (!isServiceId(category)) return <Navigate to="/app/servicios" replace />;
  return <CategoryStores key={category} category={category} />;
}

function CategoryStores({ category }: { category: ServiceId }) {
  const navigate = useNavigate();
  const { stores, error, retry } = useStoreList(category);
  const info = SERVICE_VISUALS[category];
  return (
    <ServicePage>
      <PageHeader title={info.title} subtitle="Elige una tienda para ver sus productos." onBack={() => navigate('/app/servicios')} />

      {error && <ErrorState message={error} onRetry={retry} />}

      {!stores && !error && (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando tiendas">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface-3" />
          ))}
        </div>
      )}

      {stores?.length === 0 && (
        <EmptyState
          compact
          illustration={<NoResultsIllustration />}
          title="Aún no hay tiendas aquí"
          description={`Todavía no hay tiendas de ${info.title} en Parla. ¡Pronto habrá!`}
        />
      )}

      {stores && stores.length > 0 && (
        <ul className="flex flex-col gap-3" data-testid="store-list">
          {stores.map((store) => (
            <li key={store.id}>
              <StoreCard store={store} onOpen={() => navigate(`/app/servicios/${store.id}`)} />
            </li>
          ))}
        </ul>
      )}
    </ServicePage>
  );
}

function StoreCard({ store, onOpen }: { store: StoreSummary; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="store-card"
      className="group flex w-full items-start gap-3 rounded-2xl bg-surface p-4 text-left shadow-float transition-colors duration-200 hover:bg-surface-2 md:p-5"
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-base font-bold text-ink">{store.name}</span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${store.open ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200' : 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200'}`}
          >
            {!store.open && <Moon className="size-3" />}
            {store.open ? 'Abierta' : 'Cerrada'}
          </span>
        </span>
        {store.description && <span className="mt-0.5 line-clamp-2 block text-sm text-ink-soft">{store.description}</span>}
        <span className="mt-2 flex flex-col gap-1 text-xs text-ink-soft">
          {store.address && (
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3.5 shrink-0" /> <span className="truncate">{store.address}</span>
            </span>
          )}
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5 shrink-0" /> {store.opensAt === store.closesAt ? 'Atiende las 24 horas' : `${store.opensAt} a ${store.closesAt}`}
            </span>
            <span className="flex items-center gap-1.5">
              <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" />
              {store.ratingAvg !== null ? `${store.ratingAvg.toFixed(1)} (${store.ratingCount})` : 'Sin calificaciones'}
            </span>
          </span>
          {!store.open && store.closedMessage && <span className="font-semibold text-amber-800 dark:text-amber-300">{store.closedMessage}</span>}
        </span>
      </span>
      <ChevronRight className="mt-1 size-5 shrink-0 text-ink-faint transition-transform duration-200 group-hover:translate-x-0.5" />
    </button>
  );
}
