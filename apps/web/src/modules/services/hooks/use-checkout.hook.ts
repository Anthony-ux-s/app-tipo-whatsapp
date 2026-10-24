import type { GeoPoint, MyCoupon, Order, OrderQuote, Product, QuoteRequest } from '@parla/types';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { cartCount, cartEstimateCents, useCartStore } from '@shared/stores/cart.store';
import { useOrdersStore } from '@shared/stores/orders.store';
import { toast } from '@shared/stores/toast.store';
import { ApiError, errorMessage, http } from '@shared/utils/http';

const QUOTE_DEBOUNCE_MS = 400;
const MIN_ADDRESS = 6;
const NO_COUPONS: MyCoupon[] = [];

/**
 * Carrito y pago: el gateway cotiza con los precios de la tienda y la tarifa del delivery, y suma
 * todo. Al confirmar, crea el pedido y el cobro con QR.
 */
export function useCheckout() {
  const navigate = useNavigate();
  const service = useCartStore((s) => s.service);
  const items = useCartStore((s) => s.items);
  const address = useCartStore((s) => s.address);
  const change = useCartStore((s) => s.change);
  const remove = useCartStore((s) => s.remove);
  const setAddress = useCartStore((s) => s.setAddress);
  const clear = useCartStore((s) => s.clear);
  const tipCents = useCartStore((s) => s.tipCents);
  const setTip = useCartStore((s) => s.setTip);
  const [customTip, setCustomTip] = useState('');
  const upsertOrder = useOrdersStore((s) => s.upsert);
  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [locating, setLocating] = useState(false);
  /** Cupón: lo que escribe y el que quedó aplicado (si el gateway lo aceptó). */
  const [couponDraft, setCouponDraft] = useState('');
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  // Los cupones que ganó en la ruleta aparecen listos para tocar.
  const myCoupons = useQuery({ queryKey: ['coupons', 'mine'], queryFn: () => http.get<MyCoupon[]>('/coupons/mine') }).data ?? NO_COUPONS;

  const lines = Object.values(items);

  // Cada cupón ganado dice cuánto le falta al carrito para poder usarlo (compra mínima).
  const subtotalCents = cartEstimateCents(items);
  const wallet = useMemo(() => myCoupons.map((c) => ({ ...c, missingCents: Math.max(0, c.minSubtotalCents - subtotalCents) })), [myCoupons, subtotalCents]);
  // El primer cupón que ya se puede usar se aplica solo, una vez; si la persona lo quita, no se vuelve a poner.
  const autoApplied = useRef(false);
  useEffect(() => {
    if (autoApplied.current || couponCode || subtotalCents <= 0) return;
    const usable = wallet.find((c) => c.missingCents === 0);
    if (!usable) return;
    autoApplied.current = true;
    setCouponCode(usable.code);
  }, [wallet, couponCode, subtotalCents]);
  const request = useMemo<QuoteRequest>(
    () => ({
      items: Object.values(items).map((i) => ({ productId: i.product.id, quantity: i.quantity })),
      address: { line: address.line.trim(), reference: address.reference.trim(), location: address.location ?? null },
      tipCents,
      ...(couponCode ? { couponCode } : {}),
    }),
    [items, address, tipCents, couponCode],
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
        .post<OrderQuote>(`/services/${encodeURIComponent(service)}/quote`, request)
        .then((q) => alive && setQuote(q))
        .catch((err) => {
          if (!alive) return;
          // Un cupón que no vale no frena la compra: se avisa y se cotiza sin él.
          if (request.couponCode && err instanceof ApiError && err.status === 422) {
            setCouponError(err.message);
            setCouponCode(null);
            return;
          }
          setQuoteError(errorMessage(err));
        })
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
    add: (product: Product) => change(product, 1, service),
    subtract: (product: Product) => change(product, -1, service),
    remove,
    onAddressChange: (line: string) => setAddress({ ...address, line }),
    /** Elegir una dirección guardada. */
    pickAddress: setAddress,
    myCoupons: wallet,
    useMyCoupon: (code: string) => {
      setCouponError(null);
      setCouponCode(code);
    },
    couponDraft,
    couponCode,
    couponError,
    onCouponDraft: (value: string) => {
      setCouponDraft(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20));
      setCouponError(null);
    },
    applyCoupon: () => {
      if (couponDraft.length < 3) return setCouponError('Escribe el código del cupón');
      setCouponError(null);
      setCouponCode(couponDraft);
    },
    removeCoupon: () => {
      autoApplied.current = true;
      setCouponCode(null);
      setCouponDraft('');
      setCouponError(null);
    },
    onReferenceChange: (reference: string) => setAddress({ ...address, reference }),
    /** Propina como en Rappi: montos rápidos u «Otro». Va completa al repartidor. */
    tipCents,
    tipOptions: [0, 100, 200, 300, 500],
    customTip,
    selectTip: (cents: number) => {
      setCustomTip('');
      setTip(cents);
    },
    onCustomTip: (value: string) => {
      const clean = value.replace(',', '.').replace(/[^\d.]/g, '');
      setCustomTip(clean);
      setTip(Math.round(Number(clean || '0') * 100));
    },
    /** El punto de entrega en el mapa (para que el repartidor llegue y el cliente lo siga). */
    onPickLocation: (location: GeoPoint) => setAddress({ ...address, location }),
    /** Eligió un lugar en el buscador: el pin va ahí y, si aún no escribió la dirección, se completa. */
    onPlaceFound: (location: GeoPoint, label: string) => setAddress({ ...address, location, line: address.line.trim() ? address.line : label.slice(0, 200) }),
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
        const order = await http.post<Order>(`/services/${encodeURIComponent(service)}/orders`, request);
        upsertOrder(order);
        clear();
        navigate(`/app/pedidos/${order.id}`, { replace: true });
      } catch (err) {
        toast(errorMessage(err), 'error');
        setPlacing(false);
      }
    },
    service,
    keepShopping: () => navigate(service ? `/app/servicios/${service}` : '/app/servicios'),
  };
}
