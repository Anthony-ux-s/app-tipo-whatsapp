import type { BusinessInfo } from '@parla/types';
import { ChevronRight, Pencil, Plug, Tags } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

function Row({ to, icon, title, description, testId }: { to: string; icon: ReactNode; title: string; description: string; testId: string }) {
  return (
    <Link to={to} data-testid={testId} className="group -mx-1 flex items-center gap-3 rounded-xl px-1 py-2 transition-colors duration-200 hover:bg-surface-2">
      <span className="flex size-9 items-center justify-center rounded-xl bg-teal-50 text-brand dark:bg-teal-950/60 dark:text-teal-300">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-ink">{title}</span>
        <span className="block text-sm text-ink-soft">{description}</span>
      </span>
      <ChevronRight className="size-5 text-ink-faint transition-transform duration-200 group-hover:translate-x-0.5" />
    </Link>
  );
}

/** Accesos de «Mi negocio»: datos de la tienda y de dónde salen sus productos (catálogo de Parla o su sistema). */
export function StoreLinks({ business }: { business: BusinessInfo }) {
  return (
    <div className="flex flex-col" data-testid="store-links">
      <Row to="/app/negocio/tienda" icon={<Pencil className="size-[18px]" />} title="Datos de mi tienda" description="Nombre, dirección, ubicación y horario" testId="open-store-edit" />
      {business.source === 'native' ? (
        <Row to="/app/negocio/catalogo" icon={<Tags className="size-[18px]" />} title="Mis productos" description="Precios, ofertas y stock; también puedes importar un archivo" testId="open-catalog" />
      ) : (
        <Row to="/app/negocio/conectar" icon={<Plug className="size-[18px]" />} title="Mi sistema conectado" description="Tus productos vienen de tu propio sistema" testId="open-integration" />
      )}
    </div>
  );
}
