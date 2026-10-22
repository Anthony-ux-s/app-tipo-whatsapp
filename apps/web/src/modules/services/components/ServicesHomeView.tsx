import type { ServiceId } from '@parla/types';
import { ChevronRight, Lock } from 'lucide-react';
import { Link } from 'react-router';
import { ProfileButton } from '@shared/ui/ProfileButton';
import { ErrorState } from '@shared/ui/States';
import { formatSoles } from '@shared/utils/money';
import { MARKET_PARTNERS, SERVICE_VISUALS } from '../const/services.const';
import { useServices } from '../hooks/use-services.hook';
import { OrderStatusBadge, PageHeader, ServicePage } from './ServicesUi';

/** Ícono 3D (Fluent Emoji, MIT) en /public/services. */
function Art({ name, className }: { name: string; className: string }) {
  return <img src={`/services/${name}.png`} alt="" className={`object-contain ${className}`} draggable={false} />;
}

/** Fondo suave del cuadrado de cada servicio. */
const TILE_TONES: Record<ServiceId, string> = {
  mercado: 'from-emerald-50 to-teal-100 ring-teal-200/70 dark:from-teal-950 dark:to-teal-900 dark:ring-teal-800',
  tecnologia: 'from-violet-50 to-indigo-100 ring-indigo-200/70 dark:from-indigo-950 dark:to-indigo-900 dark:ring-indigo-800',
  ferreteria: 'from-orange-50 to-amber-100 ring-amber-200/70 dark:from-orange-950 dark:to-amber-900 dark:ring-amber-800',
  salud: 'from-sky-50 to-cyan-100 ring-sky-200/70 dark:from-sky-950 dark:to-sky-900 dark:ring-sky-800',
};

/** Servicios dentro de Parla (como WeChat): una cuadrícula de íconos, cada uno lo atiende un sistema externo. */
export function ServicesHomeView() {
  const s = useServices();
  return (
    <ServicePage>
      <PageHeader title="Servicios" subtitle="Compra, paga y recibe sin salir de Parla." action={<ProfileButton />} />

      {s.error && <ErrorState message={s.error} onRetry={s.retry} />}

      <section className="rounded-2xl bg-surface p-4 shadow-float" aria-label="Servicios disponibles">
        <div className="grid grid-cols-4 gap-x-2 gap-y-4 sm:grid-cols-6">
          {(s.services ?? []).map((service) => {
            const visual = SERVICE_VISUALS[service.id];
            const open = !!visual.to && service.available;
            const tile = (
              <span className="group flex flex-col items-center gap-2.5 text-center" title={service.description}>
                <span
                  className={`relative flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br ring-1 transition-transform duration-200 ${TILE_TONES[service.id]} ${open ? 'group-hover:-translate-y-0.5 group-active:scale-95' : ''}`}
                >
                  <Art name={visual.art} className={`size-10 drop-shadow-[0_4px_6px_rgba(15,23,42,0.2)] ${open ? '' : 'opacity-60 grayscale-[40%]'}`} />
                  {!open && (
                    <span className="absolute -bottom-1.5 rounded-full bg-ink-soft px-1.5 py-px text-[9px] font-bold tracking-wide text-white uppercase">Pronto</span>
                  )}
                </span>
                <span className={`text-xs font-semibold ${open ? 'text-ink' : 'text-ink-faint'}`}>{service.name}</span>
              </span>
            );
            return open ? (
              <Link key={service.id} to={visual.to!} aria-label={service.name} data-testid={`service-${service.id}`} className="rounded-xl">
                {tile}
              </Link>
            ) : (
              <div key={service.id} aria-disabled="true" aria-label={`${service.name} · Próximamente`}>
                {tile}
              </div>
            );
          })}
          {!s.services && !s.error && [0, 1, 2].map((i) => <div key={i} className="mx-auto size-16 animate-pulse rounded-2xl bg-surface-3" />)}
        </div>
        <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-3 text-xs text-ink-soft">
          Mercado con
          {MARKET_PARTNERS.map((partner) => (
            <span key={partner.name} className="inline-flex items-center gap-1">
              <Art name={partner.icon} className="size-4" />
              <b className="font-semibold text-ink">{partner.name}</b>
            </span>
          ))}
        </p>
      </section>

      <Link
        to="/app/pedidos"
        className="group flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-float transition-colors duration-200 hover:bg-surface-2 md:px-4"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-50 to-amber-100 ring-1 ring-amber-200/70 dark:from-orange-950 dark:to-amber-900 dark:ring-amber-800">
          <Art name="pedidos" className="size-7 drop-shadow-[0_3px_4px_rgba(15,23,42,0.18)]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold text-ink">Mis pedidos</span>
          <span className="block truncate text-xs text-ink-soft">
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
