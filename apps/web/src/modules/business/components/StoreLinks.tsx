import type { BusinessInfo } from '@parla/types';
import { ChevronRight, ExternalLink, Link2, Pencil, Plug, Tags } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useFerrohubLink } from '../hooks/use-ferrohub.hook';

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
  const f = useFerrohubLink(business);
  return (
    <div className="flex flex-col" data-testid="store-links">
      {f.connected ? (
        // Una ferretería conectada configura sus datos en FerroHub: Parla solo los lee.
        <button type="button" onClick={f.openPanel} disabled={f.openingPanel} data-testid="open-ferrohub-data" className="group -mx-1 flex items-center gap-3 rounded-xl px-1 py-2 text-left transition-colors duration-200 hover:bg-surface-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-teal-50 text-brand dark:bg-teal-950/60 dark:text-teal-300">
            <ExternalLink className="size-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-ink">Datos de mi tienda en FerroHub</span>
            <span className="block text-sm text-ink-soft">Nombre, dirección, ubicación y horario se configuran allá</span>
          </span>
          <ChevronRight className="size-5 text-ink-faint transition-transform duration-200 group-hover:translate-x-0.5" />
        </button>
      ) : (
        <Row to="/app/negocio/tienda" icon={<Pencil className="size-[18px]" />} title="Datos de mi tienda" description="Nombre, dirección, ubicación y horario" testId="open-store-edit" />
      )}
      {business.service === 'ferreteria' && business.connector === null && (
        <Row to="/app/negocio/nueva/ferreteria/conectar" icon={<Link2 className="size-[18px]" />} title="Conectar con FerroHub" description="Escribe el código de enlace y tus productos llegan solos" testId="open-ferrohub-connect" />
      )}
      {business.source === 'native' ? (
        <Row to="/app/negocio/catalogo" icon={<Tags className="size-[18px]" />} title="Mis productos" description="Precios, ofertas y stock; también puedes importar un archivo" testId="open-catalog" />
      ) : f.connected ? null : (
        // Conectada a FerroHub: sus productos llegan solos, no hay nada que conectar a mano.
        <Row to="/app/negocio/conectar" icon={<Plug className="size-[18px]" />} title="Mi sistema conectado" description="Tus productos vienen de tu propio sistema" testId="open-integration" />
      )}
    </div>
  );
}
