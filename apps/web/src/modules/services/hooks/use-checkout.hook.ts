import type { GeoPoint, MyCoupon, Order, OrderQuote, Product, QuoteRequest } from '@parla/types';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { cartCount, cartEstimateCents, useCartStore } from '@shared/stores/cart.store';
import { useOrdersStore } from '@shared/stores/orders.store';
import { toast } from '@shared/stores/toast.store';
import { reversePlace, searchPlaces, type PlaceResult } from '@shared/utils/geocode';
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

  // Al escribir la dirección (y hacer una pausa), también se busca en el mapa y el pin salta ahí. Solo si la
  // persona tecleó: lo que marcó a mano en el mapa o eligió de sus direcciones guardadas no se pisa.
  // Una búsqueda por pausa (Nominatim no admite pedir letra por letra).
  const typedAddress = useRef(false);
  /** La dirección que la propia app puso a partir del pin (se puede reemplazar al mover el pin; la que escribió la persona no). */
  const autoLine = useRef<string | null>(null);
  const applyPoint = async (point: GeoPoint, provisional: string) => {
    typedAddress.current = false;
    const current = useCartStore.getState().address;
    if (current.line.trim() !== '' && current.line !== autoLine.current) {
      setAddress({ ...current, location: point });
      return;
    }
    // Enseguida hay dirección (y se cotiza el delivery); luego se cambia por la calle real cuando llega.
    autoLine.current = provisional;
    setAddress({ ...current, location: point, line: provisional });
    const name = await reversePlace(point).catch(() => null);
    const latest = useCartStore.getState().address;
    if (name && latest.line === provisional) {
      autoLine.current = name;
      setAddress({ ...latest, line: name });
    }
  };
  const addressLine = address.line;
  const [locatingAddress, setLocatingAddress] = useState(false);
  /** Los lugares que coinciden con lo escrito (para elegir el correcto) y si no hubo ninguno. */
  const [suggestions, setSuggestions] = useState<PlaceResult[]>([]);
  const [noMatch, setNoMatch] = useState(false);
  /** El número de puerta que escribió, cuando el mapa encontró la calle pero no ese número. */
  const [missingNumber, setMissingNumber] = useState<string | null>(null);
  useEffect(() => {
    const query = addressLine.trim();
    if (!typedAddress.current || query.length < 8) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLocatingAddress(true);
      searchPlaces(query, controller.signal)
        .then((found) => {
          if (!typedAddress.current) return;
          setSuggestions(found);
          setNoMatch(found.length === 0);
          const typedNumber = query.match(/\b\d{1,5}[a-z]?\b/i)?.[0] ?? null;
          setMissingNumber(typedNumber && found.length > 0 && !found.some((r) => r.label.toLowerCase().split(/[^\p{L}\p{N}]+/u).includes(typedNumber.toLowerCase())) ? typedNumber : null);
          if (!found[0]) return;
          typedAddress.current = false;
          const latest = useCartStore.getState().address;
          if (latest.line.trim() === query) setAddress({ ...latest, location: found[0].point });
        })
        .catch(() => undefined)
        .finally(() => setLocatingAddress(false));
    }, 1200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [addressLine, setAddress]);

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
    locatingAddress,
    suggestions,
    noMatch,
    missingNumber,
    /** Elegir uno de los lugares sugeridos: el pin y la dirección quedan ahí. */
    pickSuggestion: (place: PlaceResult) => {
      typedAddress.current = false;
      setSuggestions([]);
      setNoMatch(false);
      setMissingNumber(null);
      setAddress({ ...address, location: place.point, line: place.label.slice(0, 200) });
    },
    onAddressChange: (line: string) => {
      typedAddress.current = true;
      setNoMatch(false);
      setMissingNumber(null);
      setAddress({ ...address, line });
    },
    /** Elegir una dirección guardada. */
    pickAddress: (picked: typeof address) => {
      typedAddress.current = false;
      setAddress(picked);
    },
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
    onPickLocation: (location: GeoPoint) => void applyPoint(location, 'Punto marcado en el mapa'),
    /** Eligió un lugar en el buscador: el pin va ahí y, si aún no escribió la dirección, se completa. */
    locating,
    useMyLocation: () => {
      if (!navigator.geolocation) return toast('Tu navegador no comparte la ubicación. Marca el punto en el mapa.', 'error');
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          void applyPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude }, 'Mi ubicación actual');
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
