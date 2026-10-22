import type { ServiceId } from '@parla/types';
import { ChevronRight, Lock, Store } from 'lucide-react';
import { Link } from 'react-router';
import { useBusinessStore } from '@shared/stores/business.store';
import { ProfileButton } from '@shared/ui/ProfileButton';
import { ErrorState } from '@shared/ui/States';
import { formatSoles } from '@shared/utils/money';
import { SERVICE_IDS, SERVICE_VISUALS } from '../const/services.const';
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

/** Servicios dentro de Parla (como WeChat): una cuadrícula de categorías; cada una tiene varias tiendas. */
export function ServicesHomeView() {
  const s = useServices();
  const business = useBusinessStore((b) => b.business);
  const storesIn = (id: ServiceId) => s.categories?.find((c) => c.service === id)?.stores ?? 0;
  return (
    <ServicePage>
      <PageHeader title="Servicios" subtitle="Compra, paga y recibe sin salir de Parla." action={<ProfileButton />} />

      {s.error && <ErrorState message={s.error} onRetry={s.retry} />}

      <section className="rounded-2xl bg-surface p-4 shadow-float" aria-label="Categorías">
        <div className="grid grid-cols-4 gap-x-2 gap-y-4 sm:grid-cols-6">
          {s.categories &&
            SERVICE_IDS.map((id) => {
              const visual = SERVICE_VISUALS[id];
              const count = storesIn(id);
              const open = count > 0;
              const tile = (
                <span className="group flex flex-col items-center gap-2.5 text-center" title={open ? `${count} ${count === 1 ? 'tienda' : 'tiendas'}` : 'Pronto'}>
                  <span
                    className={`relative flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br ring-1 transition-transform duration-200 ${TILE_TONES[id]} ${open ? 'group-hover:-translate-y-0.5 group-active:scale-95' : ''}`}
                  >
                    <Art name={visual.art} className={`size-10 drop-shadow-[0_4px_6px_rgba(15,23,42,0.2)] ${open ? '' : 'opacity-60 grayscale-[40%]'}`} />
                    {!open && (
                      <span className="absolute -bottom-1.5 rounded-full bg-ink-soft px-1.5 py-px text-[9px] font-bold tracking-wide text-white uppercase">Pronto</span>
                    )}
                  </span>
                  <span className={`text-xs font-semibold ${open ? 'text-ink' : 'text-ink-faint'}`}>{visual.title}</span>
                </span>
              );
              return open ? (
                <Link key={id} to={`/app/servicios/c/${id}`} aria-label={visual.title} data-testid={`service-${id}`} className="rounded-xl">
                  {tile}
                </Link>
              ) : (
                <div key={id} aria-disabled="true" aria-label={`${visual.title} · Próximamente`}>
                  {tile}
                </div>
              );
            })}
          {!s.categories && !s.error && [0, 1, 2, 3].map((i) => <div key={i} className="mx-auto size-16 animate-pulse rounded-2xl bg-surface-3" />)}
        </div>
      </section>

      {business === null && (
        <Link
          to="/app/negocio/abrir"
          data-testid="open-store-banner"
          className="group flex items-center gap-3 rounded-2xl bg-gradient-to-br from-teal-50 to-amber-50 p-3 ring-1 ring-teal-100 transition-colors duration-200 hover:ring-teal-300 md:px-4 dark:from-teal-950/50 dark:to-amber-950/20 dark:ring-teal-900"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/80 text-brand dark:bg-black/20 dark:text-teal-300">
            <Store className="size-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold text-ink">¿Tienes una tienda? Ábrela en Parla</span>
            <span className="block text-xs text-ink-soft">Registra tu negocio, sube tus productos y recibe pedidos con delivery.</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-ink-faint transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      )}

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
