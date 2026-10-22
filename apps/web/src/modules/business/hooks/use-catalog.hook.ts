import type { StoreProduct } from '@parla/types';
import { useEffect, useMemo, useState } from 'react';
import { toast } from '@shared/stores/toast.store';
import { errorMessage, http } from '@shared/utils/http';
import { parseSoles } from '../utils/catalog-csv.utils';

export interface ProductDraft {
  sku: string;
  name: string;
  unit: string;
  price: string;
  listPrice: string;
  stock: string;
  category: string;
  imageUrl: string;
  active: boolean;
}

const EMPTY_DRAFT: ProductDraft = { sku: '', name: '', unit: '', price: '', listPrice: '', stock: '', category: '', imageUrl: '', active: true };

const toSoles = (cents: number) => (cents / 100).toFixed(2);

const draftOf = (p: StoreProduct): ProductDraft => ({
  sku: p.sku,
  name: p.name,
  unit: p.unit,
  price: toSoles(p.priceCents),
  listPrice: p.listPriceCents ? toSoles(p.listPriceCents) : '',
  stock: String(p.stock),
  category: p.category,
  imageUrl: p.imageUrl ?? '',
  active: p.active,
});

/** Convierte lo escrito en el formulario (precios en soles) en el producto que se envía (céntimos). */
export function productFromDraft(draft: ProductDraft): { product: StoreProduct } | { error: string } {
  const sku = draft.sku.trim();
  const name = draft.name.trim();
  if (!sku) return { error: 'Escribe un código para el producto (ej. ARR-001).' };
  if (!name) return { error: 'Escribe el nombre del producto.' };
  const price = parseSoles(draft.price);
  if (price === null || price <= 0) return { error: 'Escribe el precio en soles (ej. 4.50).' };
  let listPrice: number | null = null;
  if (draft.listPrice.trim()) {
    listPrice = parseSoles(draft.listPrice);
    if (listPrice === null || listPrice <= price) return { error: 'El precio de antes debe ser mayor que el precio de venta. Déjalo vacío si no hay oferta.' };
  }
  const stock = draft.stock.trim() === '' ? NaN : Number(draft.stock);
  if (!Number.isInteger(stock) || stock < 0) return { error: 'El stock es un número entero (0 = agotado).' };
  const image = draft.imageUrl.trim();
  if (image && !/^https:\/\//i.test(image)) return { error: 'La imagen debe ser un enlace que empiece con https://' };
  return {
    product: {
      sku,
      name,
      unit: draft.unit.trim() || 'unidad',
      priceCents: price,
      listPriceCents: listPrice,
      stock,
      category: draft.category.trim() || 'General',
      imageUrl: image || null,
      active: draft.active,
    },
  };
}

const path = (sku: string) => `/business/products/${encodeURIComponent(sku)}`;

/** Gestor del catálogo propio: lista con búsqueda y categoría, crear/editar, activar y borrar. */
export function useCatalogManager() {
  const [products, setProducts] = useState<StoreProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  /** null = cerrado; isNew distingue «Nuevo producto» de «Editar» (el código no cambia al editar). */
  const [form, setForm] = useState<{ isNew: boolean; draft: ProductDraft } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<StoreProduct | null>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    http
      .get<StoreProduct[]>('/business/products')
      .then((list) => alive && setProducts(list))
      .catch((err) => alive && setError(errorMessage(err)));
    return () => {
      alive = false;
    };
  }, [attempt]);

  const categories = useMemo(() => [...new Set((products ?? []).map((p) => p.category))].sort((a, b) => a.localeCompare(b, 'es')), [products]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (products ?? [])
      .filter((p) => (!category || p.category === category) && (!q || `${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [products, query, category]);

  const replace = (saved: StoreProduct) =>
    setProducts((list) => {
      const rest = (list ?? []).filter((p) => p.sku !== saved.sku);
      return [...rest, saved];
    });

  return {
    products,
    visible,
    categories,
    error,
    reload: () => setAttempt((n) => n + 1),
    query,
    onQuery: setQuery,
    category,
    onCategory: setCategory,
    saving,
    stats: {
      total: products?.length ?? 0,
      inactive: (products ?? []).filter((p) => !p.active).length,
      soldOut: (products ?? []).filter((p) => p.stock === 0).length,
    },
    form,
    formError,
    openNew: () => {
      setFormError(null);
      setForm({ isNew: true, draft: EMPTY_DRAFT });
    },
    openEdit: (product: StoreProduct) => {
      setFormError(null);
      setForm({ isNew: false, draft: draftOf(product) });
    },
    closeForm: () => setForm(null),
    onDraft: (changes: Partial<ProductDraft>) => {
      setFormError(null);
      setForm((f) => (f ? { ...f, draft: { ...f.draft, ...changes } } : f));
    },
    save: async () => {
      if (!form) return;
      const result = productFromDraft(form.draft);
      if ('error' in result) return setFormError(result.error);
      if (form.isNew && products?.some((p) => p.sku.toLowerCase() === result.product.sku.toLowerCase())) {
        return setFormError('Ya tienes un producto con ese código. Búscalo en la lista para editarlo.');
      }
      setSaving(result.product.sku);
      try {
        const saved = form.isNew ? await http.post<StoreProduct>('/business/products', result.product) : await http.put<StoreProduct>(path(result.product.sku), result.product);
        replace(saved);
        toast(form.isNew ? `«${saved.name}» agregado.` : `«${saved.name}» actualizado.`, 'success');
        setForm(null);
      } catch (err) {
        setFormError(errorMessage(err));
      } finally {
        setSaving(null);
      }
    },
    /** Activar o desactivar (los desactivados no se muestran a los clientes). */
    toggleActive: async (product: StoreProduct) => {
      setSaving(product.sku);
      try {
        replace(await http.put<StoreProduct>(path(product.sku), { ...product, active: !product.active }));
        toast(product.active ? `«${product.name}» ya no se muestra a tus clientes.` : `«${product.name}» vuelve a mostrarse.`, 'success');
      } catch (err) {
        toast(errorMessage(err), 'error');
      } finally {
        setSaving(null);
      }
    },
    deleting,
    askDelete: setDeleting,
    cancelDelete: () => setDeleting(null),
    confirmDelete: async () => {
      if (!deleting) return;
      setSaving(deleting.sku);
      try {
        await http.delete(path(deleting.sku));
        setProducts((list) => (list ?? []).filter((p) => p.sku !== deleting.sku));
        toast(`«${deleting.name}» eliminado.`, 'success');
        setDeleting(null);
      } catch (err) {
        toast(errorMessage(err), 'error');
      } finally {
        setSaving(null);
      }
    },
  };
}
