import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { availableOrders, myOrders, useDriverStore } from '@shared/stores/driver.store';
import { toast } from '@shared/stores/toast.store';
import { errorMessage } from '@shared/utils/http';

export type DriverTab = 'disponibles' | 'mias';

/** Rapidito para repartidores: pedidos listos para recoger y mis entregas. */
export function useDriverOrders() {
  const navigate = useNavigate();
  const driver = useDriverStore((s) => s.driver);
  const orders = useDriverStore((s) => s.orders);
  const status = useDriverStore((s) => s.status);
  const loadOrders = useDriverStore((s) => s.loadOrders);
  const [tab, setTab] = useState<DriverTab>('disponibles');
  const [error, setError] = useState<string | null>(null);
  const [togglingOnline, setTogglingOnline] = useState(false);

  const reload = () => {
    setError(null);
    loadOrders().catch((err) => setError(errorMessage(err)));
  };
  useEffect(reload, [loadOrders]);

  const available = useMemo(() => availableOrders(orders), [orders]);
  const mine = useMemo(() => myOrders(orders), [orders]);
  const active = mine.find((o) => o.status === 'driver_assigned' || o.status === 'on_the_way') ?? null;

  return {
    driver,
    tab,
    selectTab: setTab,
    available,
    mine,
    active,
    orders: tab === 'disponibles' ? available : mine,
    loading: (status === 'loading' || status === 'idle') && Object.keys(orders).length === 0,
    error,
    reload,
    open: (id: string) => navigate(`/app/rapidito/pedidos/${id}`),
    back: () => navigate('/app/pedidos'),
    togglingOnline,
    toggleOnline: async (online: boolean) => {
      setTogglingOnline(true);
      try {
        await useDriverStore.getState().setOnline(online);
        toast(online ? 'Conectado: te llegarán pedidos.' : 'Desconectado.', 'success');
      } catch (err) {
        toast(errorMessage(err), 'error');
      } finally {
        setTogglingOnline(false);
      }
    },
  };
}

/** Una entrega: tomarla, ir a la tienda, y entregarla con el código del cliente. */
export function useDriverOrderDetail() {
  const { orderId = '' } = useParams();
  const navigate = useNavigate();
  const order = useDriverStore((s) => s.orders[orderId]);
  const loadOrder = useDriverStore((s) => s.loadOrder);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  /** Foto de la entrega: opcional con código; obligatoria si el cliente no responde. */
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [noAnswer, setNoAnswer] = useState(false);

  const retry = () => {
    setError(null);
    loadOrder(orderId).catch((err) => setError(errorMessage(err)));
  };
  useEffect(retry, [orderId, loadOrder]);

  return {
    order: order ?? null,
    error,
    busy,
    retry,
    code,
    codeError,
    photoId,
    setPhotoId,
    noAnswer,
    toggleNoAnswer: () => {
      setNoAnswer((v) => !v);
      setCodeError(null);
    },
    onCodeChange: (value: string) => {
      setCode(value.replace(/\D/g, '').slice(0, 4));
      setCodeError(null);
    },
    accept: async () => {
      setBusy(true);
      try {
        await useDriverStore.getState().accept(orderId);
        toast('¡Es tuyo! Ve a la tienda a recogerlo.', 'success');
      } catch (err) {
        toast(errorMessage(err), 'error');
        retry();
      } finally {
        setBusy(false);
      }
    },
    release: async () => {
      setBusy(true);
      try {
        await useDriverStore.getState().release(orderId);
        toast('Listo: lo ofrecimos a otros repartidores.', 'success');
        navigate('/app/rapidito');
      } catch (err) {
        toast(errorMessage(err), 'error');
      } finally {
        setBusy(false);
      }
    },
    deliver: async (event?: FormEvent) => {
      event?.preventDefault();
      if (noAnswer ? !photoId : code.length !== 4) {
        setCodeError(noAnswer ? 'Toma una foto del pedido donde lo dejaste' : 'Pídele al cliente su código de 4 dígitos');
        return;
      }
      setBusy(true);
      try {
        await useDriverStore.getState().deliver(orderId, noAnswer ? { photoId: photoId! } : { code, ...(photoId ? { photoId } : {}) });
        toast(noAnswer ? 'Listo: lo dejaste con foto como prueba.' : 'Entrega confirmada. ¡Buen trabajo!', 'success');
      } catch (err) {
        setCodeError(errorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    back: () => navigate('/app/rapidito'),
  };
}
