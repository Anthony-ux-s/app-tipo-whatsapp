import { ChevronRight, Link2, Sparkles, Tags, type LucideIcon } from 'lucide-react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useBusinessStore } from '@shared/stores/business.store';
import { PageHeader, ServicePage } from '../../services/components/ServicesUi';

interface Option {
  to: string;
  testId: string;
  icon: LucideIcon;
  title: string;
  description: string;
  highlight?: boolean;
}

const OPTIONS: Option[] = [
  {
    to: '/app/negocio/nueva/ferreteria/conectar',
    testId: 'ferre-connect',
    icon: Link2,
    title: 'Ya uso FerroHub → Conectar mi tienda',
    description: 'Escribe el código de enlace y tus productos y tu stock llegan solos.',
  },
  {
    to: '/app/negocio/nueva/ferreteria/crear',
    testId: 'ferre-create',
    icon: Sparkles,
    title: 'Crear mi ferretería',
    description: 'Sistema completo: inventario, caja, empleados y reportes. Te creamos tu panel ahora mismo.',
    highlight: true,
  },
  {
    to: '/app/negocio/abrir?service=ferreteria',
    testId: 'ferre-simple',
    icon: Tags,
    title: 'Solo un catálogo simple en Parla',
    description: 'Sube tus productos uno por uno o con un archivo CSV, sin FerroHub.',
  },
];

/** «Crear tienda» → Ferretería: tres caminos claros según lo que ya tengas. */
export function FerreteriaStartView() {
  const business = useBusinessStore((s) => s.business);
  const navigate = useNavigate();
  if (business) return <Navigate to="/app/negocio" replace />;
  return (
    <ServicePage>
      <PageHeader title="Tu ferretería en Parla" subtitle="¿Cómo quieres empezar?" onBack={() => navigate('/app/negocio/nueva')} />
      <ul className="flex flex-col gap-3" data-testid="ferre-options">
        {OPTIONS.map(({ to, testId, icon: Icon, title, description, highlight }) => (
          <li key={to}>
            <Link
              to={to}
              data-testid={testId}
              className={`group flex items-center gap-4 rounded-2xl p-4 shadow-float transition-colors duration-200 md:px-5 ${highlight ? 'bg-teal-50 ring-1 ring-teal-300 hover:bg-teal-100 dark:bg-teal-950/50 dark:ring-teal-800' : 'bg-surface hover:bg-surface-2'}`}
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-brand dark:bg-teal-950/60 dark:text-teal-300">
                <Icon className="size-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-ink">{title}</span>
                <span className="block text-sm text-ink-soft">{description}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-ink-faint transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
    </ServicePage>
  );
}
