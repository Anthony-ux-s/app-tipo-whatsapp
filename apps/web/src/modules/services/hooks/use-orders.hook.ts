import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { countNewOrders, useBusinessStore } from '@shared/stores/business.store';
import { sortOrders, useOrdersStore } from '@shared/stores/orders.store';
import { errorMessage } from '@shared/utils/http';
import { isFinalStatus, minutesLeft, orderStepIndex } from '../utils/services.utils';

/** Delivery: «Mis pedidos». */
export function useOrders() {
  const navigate = useNavigate();
  const orders = useOrdersStore((s) => s.orders);
  const status = useOrdersStore((s) => s.status);
  const loadOrders = useOrdersStore((s) => s.loadOrders);
  const business = useBusinessStore((s) => s.business);
  const newBusinessOrders = useBusinessStore((s) => countNewOrders(s.orders));
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    setError(null);
    loadOrders().catch((err) => setError(errorMessage(err)));
  };
  useEffect(reload, [loadOrders]);

  return {
    orders: sortOrders(orders),
    loading: status === 'loading' || status === 'idle',
    error,
    reload,
    /** Si soy dueña de un negocio: su nombre y cuántos pedidos esperan que los acepte. */
    business: business ?? null,
    newBusinessOrders,
    open: (id: string) => navigate(`/app/pedidos/${id}`),
    back: () => navigate('/app/servicios'),
  };
}

/**
 * Detalle de un pedido: QR mientras espera el pago y seguimiento en vivo después (los cambios llegan
 * por tiempo real con order:updated).
 */
export function useOrderDetail() {
  const { orderId = '' } = useParams();
  const navigate = useNavigate();
  const order = useOrdersStore((s) => s.orders[orderId]);
  const loadOrder = useOrdersStore((s) => s.loadOrder);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setError(null);
    loadOrder(orderId).catch((err) => setError(errorMessage(err)));
  }, [orderId, loadOrder]);

  // Cuenta regresiva del cobro mientras espera el pago.
  const waiting = order?.status === 'pending_payment';
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [waiting]);

  return {
    order: order ?? null,
    error,
    step: order ? orderStepIndex(order.status) : 0,
    finished: order ? isFinalStatus(order.status) : false,
    minutesToPay: order ? minutesLeft(order.payment.expiresAt, now) : 0,
    retry: () => {
      setError(null);
      loadOrder(orderId).catch((err) => setError(errorMessage(err)));
    },
    back: () => navigate('/app/pedidos'),
    shopAgain: () => navigate('/app/servicios/mercado'),
  };
}
