import type { ServiceId } from '@parla/types';
import { ChevronRight, HeartPulse, ShoppingBasket, Smartphone, Wrench, type LucideIcon } from 'lucide-react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useBusinessStore } from '@shared/stores/business.store';
import { PageHeader, ServicePage } from '../../services/components/ServicesUi';
import { SERVICE_VISUALS } from '../../services/const/services.const';
import { createStorePath } from '../const/connectors.const';

/** Cada categoría con su ilustración y sus colores: se elige tocando una tarjeta grande. */
const CATEGORY_CARDS: { id: ServiceId; icon: LucideIcon; hint: string; tone: string }[] = [
  {
    id: 'ferreteria',
    icon: Wrench,
    hint: 'Herramientas, materiales y pinturas. Se conecta con FerroHub.',
    tone: 'from-orange-50 to-amber-100 ring-amber-200/70 dark:from-orange-950 dark:to-amber-900 dark:ring-amber-800',
  },
  {
    id: 'mercado',
    icon: ShoppingBasket,
    hint: 'Abarrotes, frutas y productos del día.',
    tone: 'from-emerald-50 to-teal-100 ring-teal-200/70 dark:from-teal-950 dark:to-teal-900 dark:ring-teal-800',
  },
  {
    id: 'salud',
    icon: HeartPulse,
    hint: 'Farmacia, botiquín y cuidado personal.',
    tone: 'from-sky-50 to-cyan-100 ring-sky-200/70 dark:from-sky-950 dark:to-sky-900 dark:ring-sky-800',
  },
  {
    id: 'tecnologia',
    icon: Smartphone,
    hint: 'Celulares, accesorios y computación.',
    tone: 'from-violet-50 to-indigo-100 ring-indigo-200/70 dark:from-indigo-950 dark:to-indigo-900 dark:ring-indigo-800',
  },
];

/** «Crear tienda», paso 1: ¿de qué es tu tienda? La categoría decide a dónde sigues. */
export function StoreCategoryView() {
  const business = useBusinessStore((s) => s.business);
  const navigate = useNavigate();
  // Ya tiene tienda: se administra desde Mi negocio (una persona, una tienda).
  if (business) return <Navigate to="/app/negocio" replace />;
  return (
    <ServicePage>
      <PageHeader title="Crear tienda" subtitle="¿Qué vendes? Elige la categoría de tu tienda." onBack={() => navigate('/app/servicios')} />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="store-categories">
        {CATEGORY_CARDS.map(({ id, icon: Icon, hint, tone }) => (
          <li key={id}>
            <Link
              to={createStorePath(id)}
              data-testid={`create-store-${id}`}
              className={`group flex h-full items-center gap-4 rounded-2xl bg-gradient-to-br p-4 ring-1 transition-transform duration-200 active:scale-[0.98] md:flex-col md:items-start md:gap-3 md:p-5 ${tone}`}
            >
              <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/80 text-ink shadow-sm dark:bg-black/25">
                <Icon className="size-8" strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-extrabold text-ink">{SERVICE_VISUALS[id].title}</span>
                <span className="block text-sm text-ink-soft">{hint}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-ink-soft transition-transform duration-200 group-hover:translate-x-0.5 md:hidden" />
            </Link>
          </li>
        ))}
      </ul>
    </ServicePage>
  );
}
