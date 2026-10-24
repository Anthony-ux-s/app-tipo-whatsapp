import type { TrendsReport } from '@parla/types';
import { Flame, Search, ShoppingBasket } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ErrorState, ListSkeleton } from '@shared/ui/States';
import { useAdminData } from '../hooks/use-admin.hook';
import { AdminRoulettes } from './AdminRoulette';

const RANGES = [7, 30, 90] as const;

function Bars({ rows, empty, unit }: { rows: { key: string; label: string; value: number; sub: string }[]; empty: string; unit: string }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-ink-soft">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <ol className="flex flex-col gap-2.5">
      {rows.map((r, i) => (
        <li key={r.key} className="flex items-center gap-3">
          <span className="w-5 shrink-0 text-center text-xs font-extrabold text-ink-faint">{i + 1}</span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-semibold text-ink">{r.label}</span>
              <span className="shrink-0 text-xs text-ink-soft">
                {r.value} {unit} · {r.sub}
              </span>
            </span>
            <span className="mt-1 block h-2 overflow-hidden rounded-full bg-surface-3">
              <span className="block h-full rounded-full bg-gradient-to-r from-teal-500 to-amber-400" style={{ width: `${Math.max(6, (r.value / max) * 100)}%` }} />
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Panel({ icon, title, hint, children }: { icon: ReactNode; title: string; hint: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-float md:p-5">
      <header>
        <h3 className="flex items-center gap-2 font-bold text-ink">
          <span className="text-brand dark:text-teal-300">{icon}</span>
          {title}
        </h3>
        <p className="text-xs text-ink-faint">{hint}</p>
      </header>
      {children}
    </section>
  );
}

/** Lo que busca y compra la gente: para decidir qué ofertas armar y a quién regalar qué. */
function Trends() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const { data, error, reload } = useAdminData<TrendsReport>(`/admin/trends?days=${days}`);
  return (
    <section className="flex flex-col gap-3" aria-label="Tendencias">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-bold text-ink">
          <Flame className="size-5 text-brand dark:text-teal-300" /> Lo que más se busca y se compra
        </h3>
        <div className="flex gap-1.5" role="group" aria-label="Período">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={days === r}
              onClick={() => setDays(r)}
              className={`h-8 rounded-full px-3 text-xs font-semibold transition-colors ${days === r ? 'bg-teal-100 text-ink dark:bg-teal-900/60 dark:text-ink' : 'bg-surface text-ink-soft shadow-float hover:text-ink'}`}
            >
              {r} días
            </button>
          ))}
        </div>
      </div>
      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <ListSkeleton rows={2} />
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <Panel icon={<Search className="size-5" />} title="Búsquedas" hint="Lo que la gente escribe en las tiendas. Si algo se busca mucho y no lo tienes, ahí hay una oportunidad.">
            <Bars rows={data.searches.map((s) => ({ key: s.term, label: s.term, value: s.count, sub: `${s.people} ${s.people === 1 ? 'persona' : 'personas'}` }))} empty="Todavía nadie buscó nada en este período." unit="veces" />
          </Panel>
          <Panel icon={<ShoppingBasket className="size-5" />} title="Más comprado" hint="Productos que más salen en los pedidos pagados. Sirven para armar ofertas y cupones.">
            <Bars rows={data.products.map((p) => ({ key: p.productId, label: p.name, value: p.quantity, sub: `${p.people} ${p.people === 1 ? 'cliente' : 'clientes'}` }))} empty="Todavía no hay compras en este período." unit="u." />
          </Panel>
        </div>
      )}
      <p className="text-xs text-ink-faint">
        Cada cliente ve primero en «Ofertas» y en la tienda los productos rebajados de lo que más compra y busca (por ejemplo, quien compra ropa ve primero las ofertas de ropa).
      </p>
    </section>
  );
}

/** Marketing: ruletas de descuentos por tipo de cliente y tendencias. */
export function AdminMarketing() {
  return (
    <div className="flex flex-col gap-8">
      <AdminRoulettes />
      <Trends />
    </div>
  );
}
