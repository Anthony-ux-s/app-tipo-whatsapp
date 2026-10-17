import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { sortBusinessOrders, useBusinessStore } from '@shared/stores/business.store';
import { toast } from '@shared/stores/toast.store';
import { errorMessage } from '@shared/utils/http';
import { BUSINESS_TABS, type BusinessTab } from '../const/business.const';

/** Panel «Mi negocio»: pedidos por pestaña (nuevos, preparando, con Rapidito, terminados). */
export function useBusinessOrders() {
  const navigate = useNavigate();
  const business = useBusinessStore((s) => s.business);
  const orders = useBusinessStore((s) => s.orders);
  const status = useBusinessStore((s) => s.status);
  const loadOrders = useBusinessStore((s) => s.loadOrders);
  const [tab, setTab] = useState<BusinessTab>('nuevos');
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    setError(null);
    loadOrders().catch((err) => setError(errorMessage(err)));
  };
  useEffect(reload, [loadOrders]);

  const sorted = useMemo(() => sortBusinessOrders(orders), [orders]);
  const counts = useMemo(
    () => Object.fromEntries(BUSINESS_TABS.map((t) => [t.id, sorted.filter((o) => t.statuses.includes(o.status)).length])) as Record<BusinessTab, number>,
    [sorted],
  );
  const statuses = BUSINESS_TABS.find((t) => t.id === tab)!.statuses;

  return {
    business,
    tab,
    selectTab: setTab,
    counts,
    orders: sorted.filter((o) => statuses.includes(o.status)),
    loading: (status === 'loading' || status === 'idle') && sorted.length === 0,
    error,
    reload,
    open: (id: string) => navigate(`/app/negocio/pedidos/${id}`),
    back: () => navigate('/app/pedidos'),
  };
}

type Action = 'accept' | 'reject' | 'ready' | 'handoff' | 'cancel' | 'reassign';

/** Un pedido del negocio: aceptarlo o rechazarlo, avisar que está listo y entregarlo al repartidor. */
export function useBusinessOrderDetail() {
  const { orderId = '' } = useParams();
  const navigate = useNavigate();
  const order = useBusinessStore((s) => s.orders[orderId]);
  const loadOrder = useBusinessStore((s) => s.loadOrder);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const retry = () => {
    setError(null);
    loadOrder(orderId).catch((err) => setError(errorMessage(err)));
  };
  useEffect(retry, [orderId, loadOrder]);

  const run = async (action: Action, done: string) => {
    setBusy(action);
    try {
      await useBusinessStore.getState()[action](orderId);
      toast(done, 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
      setConfirmReject(false);
      setConfirmCancel(false);
    }
  };

  return {
    order: order ?? null,
    error,
    busy,
    retry,
    accept: () => run('accept', 'Pedido aceptado. ¡A prepararlo!'),
    ready: () => run('ready', 'Listo. Avisamos a los repartidores de Rapidito.'),
    handoff: () => run('handoff', 'Entregado al repartidor. Va en camino al cliente.'),
    confirmReject,
    askReject: () => setConfirmReject(true),
    cancelReject: () => setConfirmReject(false),
    reject: () => run('reject', 'Pedido rechazado. Le devolvimos el pago al cliente.'),
    /** Ya aceptado y antes de que vaya en camino: se cancela y se devuelve el pago. */
    canCancel: !!order && ['preparing', 'searching_driver', 'driver_assigned'].includes(order.status),
    confirmCancel,
    askCancel: () => setConfirmCancel(true),
    closeCancel: () => setConfirmCancel(false),
    cancel: () => run('cancel', 'Pedido cancelado. Le devolvimos el pago al cliente.'),
    reassign: () => run('reassign', 'Listo: lo ofrecimos a otros repartidores.'),
    back: () => navigate('/app/negocio'),
  };
}
