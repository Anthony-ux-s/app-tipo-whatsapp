import { Eye, EyeOff, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useState } from 'react';
import { useBusinessStore } from '@shared/stores/business.store';
import { Button } from '@shared/ui/Button';
import { Field } from '@shared/ui/Field';
import { Modal } from '@shared/ui/Modal';
import { EmptyState, ErrorState, ListSkeleton } from '@shared/ui/States';
import { NoResultsIllustration } from '@shared/ui/illustrations';
import { formatSoles } from '@shared/utils/money';
import { PageHeader, ServicePage } from '../../services/components/ServicesUi';
import { ProductImage } from '../../services/components/ProductImage';
import { discountPercent } from '../../services/utils/services.utils';
import { useCatalogManager } from '../hooks/use-catalog.hook';
import { CatalogImportModal } from './CatalogImportModal';
import { CatalogSourceSwitch } from './CatalogSourceSwitch';

/**
 * Catálogo propio de la tienda («Catálogo de Parla»): lista con búsqueda y categoría, crear y editar
 * en una ventana, activar o desactivar, borrar e importar desde un archivo CSV.
 */
export function BusinessCatalogView() {
  const navigate = useNavigate();
  const business = useBusinessStore((s) => s.business);
  if (business === null) return <Navigate to="/app/negocio/abrir" replace />;
  if (business?.source === 'api') {
    return (
      <ServicePage>
        <PageHeader title="Mis productos" onBack={() => navigate('/app/negocio')} />
        <CatalogSourceSwitch current="native" source="api" />
        <div className="rounded-2xl bg-surface p-4 shadow-float" data-testid="catalog-uses-api">
          <p className="text-sm text-ink-soft">
            Hoy tu tienda usa <b className="text-ink">tu propio sistema</b>: los productos y precios se administran allá. Para manejarlos desde Parla, deja de usar tu sistema.
          </p>
          <Link to="/app/negocio/conectar" className="mt-3 inline-block text-sm font-bold text-brand hover:underline dark:text-teal-300">
            Ir a «Conectar mi sistema»
          </Link>
        </div>
      </ServicePage>
    );
  }
  return <CatalogManager source={business?.source ?? 'native'} />;
}

function CatalogManager({ source }: { source: 'native' | 'api' }) {
  const navigate = useNavigate();
  const c = useCatalogManager();
  const [importing, setImporting] = useState(false);
  return (
    <ServicePage>
      <PageHeader
        title="Mis productos"
        subtitle={c.products ? `${c.stats.total} productos · ${c.stats.inactive} ocultos · ${c.stats.soldOut} agotados` : 'Tu catálogo en Parla'}
        onBack={() => navigate('/app/negocio')}
      />
      <CatalogSourceSwitch current="native" source={source} />

      <div className="flex flex-wrap gap-2">
        <Button icon={<Plus className="size-4" />} onClick={c.openNew} data-testid="new-product">
          Nuevo producto
        </Button>
        <Button variant="secondary" icon={<Upload className="size-4" />} onClick={() => setImporting(true)} data-testid="open-import">
          Importar archivo CSV
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative flex flex-1 items-center">
          <Search className="pointer-events-none absolute left-3.5 size-5 text-ink-faint" />
          <input
            type="search"
            value={c.query}
            onChange={(e) => c.onQuery(e.target.value)}
            placeholder="Buscar por nombre o código"
            aria-label="Buscar en mis productos"
            className="h-11 w-full rounded-2xl bg-surface pr-4 pl-11 text-[15px] text-ink shadow-float outline-none placeholder:text-ink-faint focus:ring-2 focus:ring-teal-500/40"
          />
        </label>
        {c.categories.length > 1 && (
          <select
            value={c.category}
            onChange={(e) => c.onCategory(e.target.value)}
            aria-label="Filtrar por categoría"
            className="h-11 rounded-2xl bg-surface px-3 text-[15px] text-ink shadow-float outline-none focus:ring-2 focus:ring-teal-500/40"
          >
            <option value="">Todas las categorías</option>
            {c.categories.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
      </div>

      {c.error && !c.products ? (
        <ErrorState message={c.error} onRetry={c.reload} />
      ) : !c.products ? (
        <ListSkeleton rows={6} />
      ) : c.products.length === 0 ? (
        <EmptyState
          compact
          illustration={<NoResultsIllustration />}
          title="Aún no tienes productos"
          description="Agrega el primero o sube un archivo con todos tus productos. Descarga la plantilla en «Importar archivo CSV»."
        />
      ) : c.visible.length === 0 ? (
        <EmptyState compact illustration={<NoResultsIllustration />} title="Sin resultados" description="Prueba con otro nombre o categoría." />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-float" data-testid="catalog-list">
          {c.visible.map((p) => {
            const discount = discountPercent(p.priceCents, p.listPriceCents ?? undefined);
            return (
              <li key={p.sku} data-testid="catalog-item" className={`flex items-center gap-3 px-4 py-3 md:px-5 ${p.active ? '' : 'opacity-60'}`}>
                <span className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-3 text-ink-soft">
                  <ProductImage name={p.name} category={p.category} imageUrl={p.imageUrl} className="size-9" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-ink">{p.name}</span>
                  <span className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className={`font-bold ${discount ? 'text-rose-700 dark:text-rose-400' : 'text-ink'}`}>{formatSoles(p.priceCents)}</span>
                    {discount > 0 && <span className="text-xs text-ink-faint line-through">{formatSoles(p.listPriceCents!)}</span>}
                    <span className="text-xs text-ink-faint">· {p.unit} · {p.category}</span>
                  </span>
                  <span className="block text-xs text-ink-faint">
                    Código {p.sku} · {p.stock === 0 ? 'Agotado' : `${p.stock} en stock`}
                    {!p.active && ' · Oculto'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void c.toggleActive(p)}
                  disabled={c.saving === p.sku}
                  aria-label={p.active ? `Ocultar ${p.name}` : `Mostrar ${p.name}`}
                  title={p.active ? 'Ocultar a los clientes' : 'Mostrar a los clientes'}
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors duration-200 hover:bg-surface-3 hover:text-ink disabled:opacity-50"
                >
                  {p.active ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => c.openEdit(p)}
                  aria-label={`Editar ${p.name}`}
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors duration-200 hover:bg-surface-3 hover:text-ink"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => c.askDelete(p)}
                  aria-label={`Eliminar ${p.name}`}
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors duration-200 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/50"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={!!c.form}
        onClose={c.closeForm}
        title={c.form?.isNew ? 'Nuevo producto' : 'Editar producto'}
        description={c.form?.isNew ? undefined : `Código ${c.form?.draft.sku}`}
        footer={
          <>
            <Button variant="ghost" onClick={c.closeForm}>Cancelar</Button>
            <Button onClick={() => void c.save()} loading={!!c.saving && !!c.form} data-testid="save-product">Guardar</Button>
          </>
        }
      >
        {c.form && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void c.save();
            }}
          >
            <Field label="Nombre" maxLength={120} value={c.form.draft.name} onChange={(e) => c.onDraft({ name: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Código (sku)" hint={c.form.isNew ? 'Único por producto.' : 'No se puede cambiar.'} maxLength={64} value={c.form.draft.sku} disabled={!c.form.isNew} onChange={(e) => c.onDraft({ sku: e.target.value })} />
              <Field label="Presentación" placeholder="1 kg, 750 ml…" maxLength={60} value={c.form.draft.unit} onChange={(e) => c.onDraft({ unit: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Precio de venta (S/)" inputMode="decimal" placeholder="4.50" value={c.form.draft.price} onChange={(e) => c.onDraft({ price: e.target.value })} />
              <Field label="Precio de antes (S/)" hint="Solo si está en oferta." inputMode="decimal" placeholder="Sin oferta" value={c.form.draft.listPrice} onChange={(e) => c.onDraft({ listPrice: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Stock (unidades)" hint="0 = agotado." inputMode="numeric" value={c.form.draft.stock} onChange={(e) => c.onDraft({ stock: e.target.value.replace(/\D/g, '') })} />
              <Field label="Categoría" placeholder="Abarrotes" maxLength={60} list="categorias-catalogo" value={c.form.draft.category} onChange={(e) => c.onDraft({ category: e.target.value })} />
              <datalist id="categorias-catalogo">
                {c.categories.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
            <Field label="Foto (enlace https://, opcional)" inputMode="url" placeholder="https://…" value={c.form.draft.imageUrl} onChange={(e) => c.onDraft({ imageUrl: e.target.value })} />
            <label className="flex items-center gap-2 text-sm font-medium text-ink">
              <input type="checkbox" checked={c.form.draft.active} onChange={(e) => c.onDraft({ active: e.target.checked })} className="size-4 accent-teal-600" />
              Mostrar a mis clientes
            </label>
            {c.formError && <p role="alert" className="text-sm font-semibold text-rose-700 dark:text-rose-400">{c.formError}</p>}
          </form>
        )}
      </Modal>

      <Modal
        open={!!c.deleting}
        onClose={c.cancelDelete}
        size="sm"
        title="¿Eliminar este producto?"
        description={c.deleting ? `«${c.deleting.name}» dejará de estar en tu catálogo. Si solo quieres que no se vea, ocúltalo.` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={c.cancelDelete}>No, dejarlo</Button>
            <Button variant="danger" onClick={() => void c.confirmDelete()} loading={!!c.deleting && c.saving === c.deleting.sku} data-testid="confirm-delete">
              Sí, eliminar
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">Esta acción no se puede deshacer.</p>
      </Modal>

      <CatalogImportModal open={importing} onClose={() => setImporting(false)} onFinished={c.reload} />
    </ServicePage>
  );
}
