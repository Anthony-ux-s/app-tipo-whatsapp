import type { Order, Product } from '@parla/types';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useCartStore } from '@shared/stores/cart.store';
import { toast } from '@shared/stores/toast.store';
import { errorMessage, http } from '@shared/utils/http';

/**
 * «Volver a pedir» (como en Rappi): arma el carrito con los mismos productos y la misma dirección,
 * con los precios y el stock de ahora, y abre el carrito para revisarlo antes de pagar.
 */
export function useReorder() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const reorder = async (order: Order) => {
    setLoading(true);
    try {
      const ids = order.lines.map((l) => l.productId).join(',');
      const products = await http.get<Product[]>(`/services/${encodeURIComponent(order.service)}/products?ids=${encodeURIComponent(ids)}`);
      const byId = new Map(products.map((p) => [p.id, p]));
      const lines = order.lines.flatMap((l) => {
        const product = byId.get(l.productId);
        return product ? [{ product, quantity: l.quantity }] : [];
      });
      const added = useCartStore.getState().refill(lines, order.service);
      if (added === 0) {
        toast('Esos productos ya no están disponibles.', 'error');
        return;
      }
      useCartStore.getState().setAddress(order.address);
      const missing = order.lines.length - added;
      const short = lines.some((l) => l.product.stock < l.quantity);
      if (missing > 0 || short) toast(missing > 0 ? `${missing} producto(s) ya no están disponibles; revisa tu carrito.` : 'Algunos productos tienen menos stock; ajustamos las cantidades.', 'info');
      navigate(`/app/servicios/${order.service}/carrito`);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  return { reorder, loading };
}
