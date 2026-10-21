import { useEffect, useMemo, useState } from 'react';
import type { Product } from '@parla/types';
import { useBusinessStore } from '@shared/stores/business.store';
import { toast } from '@shared/stores/toast.store';
import { errorMessage } from '@shared/utils/http';

/** «Mi tienda»: si recibe pedidos ahora, pausar o reanudarlos, y el horario de atención. */
export function useStoreSettings() {
  const business = useBusinessStore((s) => s.business);
  const status = useBusinessStore((s) => s.storeStatus);
  const loadStoreStatus = useBusinessStore((s) => s.loadStoreStatus);
  const updateBusiness = useBusinessStore((s) => s.updateBusiness);
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadStoreStatus().catch(() => undefined);
    // El estado depende de la hora: se revisa cada minuto mientras el panel está abierto.
    const timer = window.setInterval(() => void loadStoreStatus().catch(() => undefined), 60_000);
    return () => window.clearInterval(timer);
  }, [loadStoreStatus, business?.id]);

  useEffect(() => {
    if (!business) return;
    setOpensAt(business.opensAt);
    setClosesAt(business.closesAt);
  }, [business]);

  const save = async (changes: Parameters<typeof updateBusiness>[0], done: string) => {
    setSaving(true);
    try {
      await updateBusiness(changes);
      toast(done, 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return {
    business,
    status,
    opensAt,
    closesAt,
    saving,
    allDay: opensAt === closesAt,
    hoursChanged: !!business && (opensAt !== business.opensAt || closesAt !== business.closesAt),
    onOpensAt: setOpensAt,
    onClosesAt: setClosesAt,
    toggleAccepting: (accepting: boolean) =>
      save({ acceptingOrders: accepting }, accepting ? 'Volviste a recibir pedidos.' : 'Pausaste los pedidos: nadie puede pagar hasta que los reanudes.'),
    saveHours: () => save({ opensAt, closesAt }, 'Horario guardado.'),
  };
}

export interface ProductDraft {
  price: string;
  listPrice: string;
  stock: string;
}

const toSoles = (cents: number) => (cents / 100).toFixed(2);
const toCents = (soles: string) => Math.round(Number(soles.replace(',', '.')) * 100);

/** Catálogo de la tienda: precios, ofertas y stock, por categoría y con búsqueda. */
export function useStoreCatalog() {
  const catalog = useBusinessStore((s) => s.catalog);
  const loadCatalog = useBusinessStore((s) => s.loadCatalog);
  const updateProduct = useBusinessStore((s) => s.updateProduct);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);
  const [draft, setDraft] = useState<ProductDraft>({ price: '', listPrice: '', stock: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const reload = () => {
    setError(null);
    loadCatalog().catch((err) => setError(errorMessage(err)));
  };
  useEffect(reload, [loadCatalog]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (catalog ?? []).filter((p) => !q || `${p.name} ${p.category}`.toLowerCase().includes(q));
    const byCategory = new Map<string, Product[]>();
    for (const p of list) byCategory.set(p.category, [...(byCategory.get(p.category) ?? []), p]);
    return [...byCategory.entries()].map(([category, products]) => ({ category, products }));
  }, [catalog, query]);

  const run = async (product: Product, changes: Parameters<typeof updateProduct>[1], done: string) => {
    setSaving(product.id);
    try {
      await updateProduct(product.id, changes);
      toast(done, 'success');
      return true;
    } catch (err) {
      const message = errorMessage(err);
      setFormError(message);
      toast(message, 'error');
      return false;
    } finally {
      setSaving(null);
    }
  };

  return {
    catalog,
    groups,
    error,
    reload,
    query,
    onQuery: setQuery,
    saving,
    offers: (catalog ?? []).filter((p) => p.listPriceCents).length,
    soldOut: (catalog ?? []).filter((p) => p.stock === 0).length,
    editing,
    draft,
    formError,
    edit: (product: Product) => {
      setEditing(product);
      setFormError(null);
      setDraft({ price: toSoles(product.priceCents), listPrice: product.listPriceCents ? toSoles(product.listPriceCents) : '', stock: String(product.stock) });
    },
    closeEdit: () => setEditing(null),
    onDraft: (changes: Partial<ProductDraft>) => setDraft((d) => ({ ...d, ...changes })),
    saveEdit: async () => {
      if (!editing) return;
      const price = toCents(draft.price);
      const listPrice = draft.listPrice.trim() ? toCents(draft.listPrice) : null;
      const stock = Number(draft.stock);
      if (!Number.isFinite(price) || price <= 0) return setFormError('Escribe el precio en soles (p. ej. 4.50)');
      if (listPrice !== null && (!Number.isFinite(listPrice) || listPrice <= price)) return setFormError('El precio normal debe ser mayor que el de oferta');
      if (!Number.isInteger(stock) || stock < 0) return setFormError('El stock es un número entero (0 = agotado)');
      if (await run(editing, { priceCents: price, listPriceCents: listPrice, stock }, `«${editing.name}» actualizado.`)) setEditing(null);
    },
    /** Atajo: agotar o reponer (10 unidades) sin abrir el formulario. */
    toggleSoldOut: (product: Product) =>
      run(product, { stock: product.stock === 0 ? 10 : 0 }, product.stock === 0 ? `«${product.name}» repuesto (10 unidades).` : `«${product.name}» marcado como agotado.`),
  };
}
