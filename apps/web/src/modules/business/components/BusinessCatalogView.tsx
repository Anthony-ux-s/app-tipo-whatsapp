import { Pencil, Search } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button } from '@shared/ui/Button';
import { Field } from '@shared/ui/Field';
import { Modal } from '@shared/ui/Modal';
import { ErrorState, ListSkeleton } from '@shared/ui/States';
import { formatSoles } from '@shared/utils/money';
import { PageHeader, ServicePage } from '../../services/components/ServicesUi';
import { discountPercent } from '../../services/utils/services.utils';
import { ProductImage } from '../../services/components/ProductImage';
import { useStoreCatalog } from '../hooks/use-store-settings.hook';

/**
 * Catálogo de la tienda para el dueño: precio, oferta (precio normal tachado) y stock de cada
 * producto. Se guarda en el sistema de la tienda y se ve al instante en Mercado y en Ofertas.
 */
export function BusinessCatalogView() {
  const navigate = useNavigate();
  const c = useStoreCatalog();
  return (
    <ServicePage>
      <PageHeader
        title="Catálogo y precios"
        subtitle={c.catalog ? `${c.catalog.length} productos · ${c.offers} en oferta · ${c.soldOut} agotados` : 'Tus productos en la tienda'}
        onBack={() => navigate('/app/negocio')}
      />

      <label className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3.5 size-5 text-ink-faint" />
        <input
          type="search"
          value={c.query}
          onChange={(e) => c.onQuery(e.target.value)}
          placeholder="Buscar un producto o categoría"
          aria-label="Buscar en el catálogo"
          className="h-11 w-full rounded-2xl bg-surface pr-4 pl-11 text-[15px] text-ink shadow-float outline-none placeholder:text-ink-faint focus:ring-2 focus:ring-teal-500/40"
        />
      </label>

      {c.error && !c.catalog ? (
        <ErrorState message={c.error} onRetry={c.reload} />
      ) : !c.catalog ? (
        <ListSkeleton rows={6} />
      ) : (
        c.groups.map((group) => (
          <section key={group.category} aria-label={group.category} className="flex flex-col gap-2">
            <h2 className="px-1 text-sm font-bold text-ink-soft">{group.category}</h2>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-float">
              {group.products.map((p) => {
                const discount = discountPercent(p.priceCents, p.listPriceCents);
                return (
                  <li key={p.id} data-testid="catalog-item" className="flex items-center gap-3 px-4 py-3 md:px-5">
                    <span className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-3 text-ink-soft">
                      <ProductImage name={p.name} category={group.category} imageUrl={p.imageUrl} className="size-9" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-ink">{p.name}</span>
                      <span className="flex flex-wrap items-baseline gap-x-2 text-sm">
                        <span className={`font-bold ${discount ? 'text-rose-700 dark:text-rose-400' : 'text-ink'}`}>{formatSoles(p.priceCents)}</span>
                        {discount > 0 && <span className="text-xs text-ink-faint line-through">{formatSoles(p.listPriceCents!)}</span>}
                        {discount > 0 && <span className="text-xs font-bold text-rose-700 dark:text-rose-400">-{discount} %</span>}
                        <span className="text-xs text-ink-faint">· {p.unit}</span>
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => c.toggleSoldOut(p)}
                      disabled={c.saving === p.id}
                      title={p.stock === 0 ? 'Reponer 10 unidades' : 'Marcar como agotado'}
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold transition-colors duration-200 disabled:opacity-50 ${p.stock === 0 ? 'bg-rose-100 text-rose-900 hover:bg-rose-200 dark:bg-rose-900/50 dark:text-rose-200' : 'bg-surface-3 text-ink-soft hover:text-ink'}`}
                      data-testid="stock-pill"
                    >
                      {p.stock === 0 ? 'Agotado' : `${p.stock} en stock`}
                    </button>
                    <button
                      type="button"
                      onClick={() => c.edit(p)}
                      aria-label={`Editar ${p.name}`}
                      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors duration-200 hover:bg-surface-3 hover:text-ink"
                    >
                      <Pencil className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      <Modal
        open={!!c.editing}
        onClose={c.closeEdit}
        size="sm"
        title={c.editing ? c.editing.name : ''}
        description={c.editing?.unit}
        footer={
          <>
            <Button variant="ghost" onClick={c.closeEdit}>Cancelar</Button>
            <Button onClick={c.saveEdit} loading={!!c.editing && c.saving === c.editing.id} data-testid="save-product">Guardar</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label="Precio de venta (S/)" inputMode="decimal" value={c.draft.price} onChange={(e) => c.onDraft({ price: e.target.value })} />
          <Field
            label="Precio normal (S/)"
            hint="Para ponerlo en oferta: el precio de antes, que se verá tachado. Déjalo vacío para quitar la oferta."
            inputMode="decimal"
            placeholder="Sin oferta"
            value={c.draft.listPrice}
            onChange={(e) => c.onDraft({ listPrice: e.target.value })}
          />
          <Field label="Stock (unidades)" hint="0 = agotado." inputMode="numeric" value={c.draft.stock} onChange={(e) => c.onDraft({ stock: e.target.value.replace(/\D/g, '') })} />
          {c.formError && <p role="alert" className="text-sm font-semibold text-rose-700 dark:text-rose-400">{c.formError}</p>}
        </div>
      </Modal>
    </ServicePage>
  );
}
