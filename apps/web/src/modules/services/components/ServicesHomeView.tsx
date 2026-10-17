import { ChevronRight, Lock, Receipt } from 'lucide-react';
import { Link } from 'react-router';
import { ErrorState } from '@shared/ui/States';
import { formatSoles } from '@shared/utils/money';
import { SERVICE_VISUALS } from '../const/services.const';
import { useServices } from '../hooks/use-services.hook';
import { OrderStatusBadge, PageHeader, ServicePage } from './ServicesUi';

/** Servicios dentro de Parla (como WeChat): cada uno lo atiende un sistema externo a través del gateway. */
export function ServicesHomeView() {
  const s = useServices();
  return (
    <ServicePage>
      <PageHeader title="Servicios" subtitle="Compra, paga y recibe sin salir de Parla." />

      {s.error && <ErrorState message={s.error} onRetry={s.retry} />}

      <section className="rounded-2xl bg-surface p-4 shadow-float md:p-5" aria-label="Servicios disponibles">
        <div className="grid grid-cols-4 gap-x-2 gap-y-4 sm:grid-cols-6">
          {(s.services ?? []).map((service) => {
            const visual = SERVICE_VISUALS[service.id];
            const Icon = visual.icon;
            const tile = (
              <span className="group flex flex-col items-center gap-1.5 text-center" title={service.description}>
                <span
                  className={`relative flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-float transition-transform duration-200 ${visual.gradient} ${service.available ? 'group-hover:-translate-y-0.5' : 'opacity-50 grayscale-[40%]'}`}
                >
                  <Icon className="size-5" />
                </span>
                <span className={`text-xs font-semibold ${service.available ? 'text-ink' : 'text-ink-faint'}`}>{service.name}</span>
                {!service.available && (
                  <span className="-mt-1 rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] font-bold text-ink-soft">Próximamente</span>
                )}
              </span>
            );
            return visual.to && service.available ? (
              <Link key={service.id} to={visual.to} aria-label={service.name} data-testid={`service-${service.id}`} className="rounded-xl py-1">
                {tile}
              </Link>
            ) : (
              <div key={service.id} aria-disabled="true" className="py-1">
                {tile}
              </div>
            );
          })}
          {!s.services &&
            !s.error &&
            [0, 1].map((i) => <div key={i} className="mx-auto size-12 animate-pulse rounded-2xl bg-surface-3" />)}
        </div>
        <p className="mt-4 border-t border-line pt-3 text-xs text-ink-soft">
          <span className="font-semibold text-ink">Mercado:</span> tienda MercaYa · delivery MotoYa · pago con QR PagaYa
        </p>
      </section>

      <Link
        to="/app/pedidos"
        className="group flex items-center gap-4 rounded-2xl bg-surface p-4 shadow-float transition-colors duration-200 hover:bg-surface-2 md:px-5"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-brand dark:bg-teal-950/60 dark:text-teal-300">
          <Receipt className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-ink">Mis pedidos</span>
          <span className="block truncate text-sm text-ink-soft">
            {s.latestOrder ? `Último: ${formatSoles(s.latestOrder.totalCents)} · ${s.latestOrder.lines.length} productos` : 'Aquí verás tus compras y su seguimiento'}
          </span>
        </span>
        {s.latestOrder && <OrderStatusBadge status={s.latestOrder.status} />}
        <ChevronRight className="size-5 shrink-0 text-ink-faint transition-transform duration-200 group-hover:translate-x-0.5" />
      </Link>

      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink-faint">
        <Lock className="size-3.5" /> Los precios y el total los confirma la tienda; pagas con QR y el delivery llega a tu puerta.
      </p>
    </ServicePage>
  );
}
