import type { GeoPoint, Order, OrderQuote, Product, QuoteRequest } from '@parla/types';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { cartCount, useCartStore } from '@shared/stores/cart.store';
import { useOrdersStore } from '@shared/stores/orders.store';
import { toast } from '@shared/stores/toast.store';
import { errorMessage, http } from '@shared/utils/http';

const QUOTE_DEBOUNCE_MS = 400;
const MIN_ADDRESS = 6;

/**
 * Carrito y pago: el gateway cotiza con los precios de la tienda y la tarifa del delivery, y suma
 * todo. Al confirmar, crea el pedido y el cobro con QR.
 */
export function useCheckout() {
  const navigate = useNavigate();
  const items = useCartStore((s) => s.items);
  const address = useCartStore((s) => s.address);
  const change = useCartStore((s) => s.change);
  const remove = useCartStore((s) => s.remove);
  const setAddress = useCartStore((s) => s.setAddress);
  const clear = useCartStore((s) => s.clear);
  const upsertOrder = useOrdersStore((s) => s.upsert);
  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [locating, setLocating] = useState(false);

  const lines = Object.values(items);
  const request = useMemo<QuoteRequest>(
    () => ({
      items: Object.values(items).map((i) => ({ productId: i.product.id, quantity: i.quantity })),
      address: { line: address.line.trim(), reference: address.reference.trim(), location: address.location ?? null },
    }),
    [items, address],
  );
  const addressReady = request.address.line.length >= MIN_ADDRESS;

  // Se recotiza solo cuando cambian el carrito o la dirección (con una pequeña espera).
  useEffect(() => {
    setQuote(null);
    setQuoteError(null);
    if (request.items.length === 0 || !addressReady) return;
    let alive = true;
    setQuoting(true);
    const timer = window.setTimeout(() => {
      http
        .post<OrderQuote>('/services/mercado/quote', request)
        .then((q) => alive && setQuote(q))
        .catch((err) => alive && setQuoteError(errorMessage(err)))
        .finally(() => alive && setQuoting(false));
    }, QUOTE_DEBOUNCE_MS);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [request, addressReady]);

  return {
    lines,
    count: cartCount(items),
    address,
    addressReady,
    quote,
    quoting,
    quoteError,
    placing,
    canPay: Boolean(quote) && !quoting && !placing,
    add: (product: Product) => change(product, 1),
    subtract: (product: Product) => change(product, -1),
    remove,
    onAddressChange: (line: string) => setAddress({ ...address, line }),
    onReferenceChange: (reference: string) => setAddress({ ...address, reference }),
    /** El punto de entrega en el mapa (para que el repartidor llegue y el cliente lo siga). */
    onPickLocation: (location: GeoPoint) => setAddress({ ...address, location }),
    locating,
    useMyLocation: () => {
      if (!navigator.geolocation) return toast('Tu navegador no comparte la ubicación. Marca el punto en el mapa.', 'error');
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setAddress({ ...address, location: { lat: pos.coords.latitude, lng: pos.coords.longitude } });
          setLocating(false);
        },
        () => {
          toast('No pudimos obtener tu ubicación. Marca el punto en el mapa.', 'error');
          setLocating(false);
        },
        { enableHighAccuracy: true, timeout: 10_000 },
      );
    },
    pay: async () => {
      if (!quote) return;
      setPlacing(true);
      try {
        const order = await http.post<Order>('/services/mercado/orders', request);
        upsertOrder(order);
        clear();
        navigate(`/app/pedidos/${order.id}`, { replace: true });
      } catch (err) {
        toast(errorMessage(err), 'error');
        setPlacing(false);
      }
    },
    keepShopping: () => navigate('/app/servicios/mercado'),
  };
}
