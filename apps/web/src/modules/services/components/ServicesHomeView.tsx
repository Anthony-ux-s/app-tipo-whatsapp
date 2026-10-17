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

      <div className="grid gap-3 sm:grid-cols-2">
        {(s.services ?? []).map((service) => {
          const visual = SERVICE_VISUALS[service.id];
          const Icon = visual.icon;
          const card = (
            <div
              className={`relative flex h-full min-h-40 flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br p-5 text-white shadow-float transition-transform duration-200 ${visual.gradient} ${service.available ? 'hover:-translate-y-0.5' : 'opacity-75'}`}
            >
              <span className="flex size-12 items-center justify-center rounded-2xl bg-white/15">
                <Icon className="size-6" />
              </span>
              <div className="mt-6">
                <p className="flex items-center gap-2 text-lg font-extrabold">
                  {service.name}
                  {!service.available && <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold">Próximamente</span>}
                </p>
                <p className="text-sm text-white/85">{service.description}</p>
                {service.available && <p className="mt-2 text-xs text-white/70">{service.provider}</p>}
              </div>
            </div>
          );
          return visual.to && service.available ? (
            <Link key={service.id} to={visual.to} aria-label={service.name} data-testid={`service-${service.id}`}>
              {card}
            </Link>
          ) : (
            <div key={service.id} aria-disabled="true">
              {card}
            </div>
          );
        })}
        {!s.services &&
          !s.error &&
          [0, 1].map((i) => <div key={i} className="min-h-40 animate-pulse rounded-2xl bg-surface-3" />)}
      </div>

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
