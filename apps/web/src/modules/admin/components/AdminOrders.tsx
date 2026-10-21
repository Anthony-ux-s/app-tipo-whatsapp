import type { AdminOrder, OrderStatus } from '@parla/types';
import { ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from '@shared/stores/toast.store';
import { Button } from '@shared/ui/Button';
import { Field } from '@shared/ui/Field';
import { Modal } from '@shared/ui/Modal';
import { EmptyState, ErrorState, ListSkeleton } from '@shared/ui/States';
import { EmptyChatsIllustration } from '@shared/ui/illustrations';
import { formatLongDate, formatSoles } from '@shared/utils/money';
import { errorMessage, http } from '@shared/utils/http';
import { OrderStatusBadge, OrderTimeline } from '../../services/components/ServicesUi';
import { useAdminList } from '../hooks/use-admin.hook';

type View = 'active' | 'delivered' | 'closed' | 'all';
const VIEWS: { id: View; label: string }[] = [
  { id: 'active', label: 'En curso' },
  { id: 'delivered', label: 'Entregados' },
  { id: 'closed', label: 'Cancelados' },
  { id: 'all', label: 'Todos' },
];
/** Hasta aquí soporte puede cancelarlo (con devolución); en camino o entregado, ya no. */
const CANCELLABLE: OrderStatus[] = ['pending_payment', 'paid', 'preparing', 'searching_driver', 'driver_assigned'];

/** Todos los pedidos para soporte: buscar, ver su historial y cancelar con devolución los que se traben. */
export function AdminOrders({ chip }: { chip: (on: boolean, onClick: () => void, label: string) => ReactNode }) {
  const [view, setView] = useState<View>('active');
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const list = useAdminList<AdminOrder>(`/admin/orders?view=${view}&q=${encodeURIComponent(query)}`);
  const [cancelling, setCancelling] = useState<AdminOrder | null>(null);
  const [busy, setBusy] = useState(false);

  // Buscar mientras escribe, con una pequeña espera.
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(draft.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [draft]);

  const cancel = async () => {
    if (!cancelling) return;
    setBusy(true);
    try {
      await http.post(`/admin/orders/${encodeURIComponent(cancelling.id)}/cancel`);
      toast('Pedido cancelado: devolvimos el pago al cliente.', 'success');
      setCancelling(null);
      list.reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="-mt-2 flex gap-1.5 overflow-x-auto pb-1">{VIEWS.map((v) => chip(view === v.id, () => setView(v.id), v.label))}</div>
      <Field label="Buscar" placeholder="Id del pedido, nombre o teléfono del cliente" value={draft} onChange={(e) => setDraft(e.target.value)} icon={<Search className="size-4" />} data-testid="admin-order-search" />

      {list.error && !list.items ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : !list.items ? (
        <ListSkeleton rows={3} />
      ) : list.items.length === 0 ? (
        <EmptyState compact illustration={<EmptyChatsIllustration />} title="Nada por aquí" description="No hay pedidos con ese filtro." />
      ) : (
        <ul className="flex flex-col gap-3" data-testid="admin-orders">
          {list.items.map((o) => (
            <li key={o.id}>
              <OrderItem order={o} onCancel={CANCELLABLE.includes(o.status) ? () => setCancelling(o) : undefined} />
            </li>
          ))}
        </ul>
      )}

      {cancelling && (
        <Modal
          open
          size="sm"
          onClose={() => setCancelling(null)}
          title="¿Cancelar este pedido?"
          footer={
            <>
              <Button variant="ghost" onClick={() => setCancelling(null)}>Volver</Button>
              <Button variant="danger" icon={<X className="size-4" />} onClick={cancel} loading={busy} data-testid="confirm-admin-cancel">
                Cancelar pedido
              </Button>
            </>
          }
        >
          <p className="text-sm text-ink-soft">
            {cancelling.paidAt
              ? `Le devolvemos ${formatSoles(cancelling.totalCents)} a ${cancelling.customerName} en PagaYa. La tienda y el repartidor reciben el aviso.`
              : 'Todavía no se pagó: anulamos el cobro y el QR deja de servir.'}
          </p>
        </Modal>
      )}
    </>
  );
}

function OrderItem({ order, onCancel }: { order: AdminOrder; onCancel?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="flex flex-col gap-2 rounded-2xl bg-surface p-4 shadow-float md:p-5" data-testid="admin-order" data-id={order.id}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-ink">
            {order.customerName} · {formatSoles(order.totalCents)}
          </p>
          <p className="text-sm text-ink-soft">
            {[order.businessName, order.driverName && `repartidor ${order.driverName}`, order.customerPhone].filter(Boolean).join(' · ')}
          </p>
          <p className="font-mono text-xs text-ink-faint">
            {order.id} · {formatLongDate(order.createdAt)}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>
      <p className="text-sm text-ink-soft">
        {order.lines.map((l) => `${l.quantity}× ${l.name}`).join(' · ')}
        {order.couponCode ? ` · cupón ${order.couponCode} (− ${formatSoles(order.discountCents)})` : ''}
      </p>
      {order.openClaims > 0 && <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Tiene un reclamo abierto</p>}
      {order.refundedAt && <p className="text-sm text-ink-soft">Pago devuelto</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" icon={<ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />} onClick={() => setOpen((v) => !v)}>
          {open ? 'Ocultar historial' : 'Ver historial'}
        </Button>
        {onCancel && (
          <Button variant="ghost" size="sm" icon={<X className="size-4" />} onClick={onCancel} data-testid="admin-cancel-order">
            Cancelar y devolver
          </Button>
        )}
      </div>
      {open && (
        <>
          <p className="text-sm text-ink-soft">
            {order.address.line}
            {order.address.reference ? ` · ${order.address.reference}` : ''}
          </p>
          <OrderTimeline entries={order.timeline} />
        </>
      )}
    </article>
  );
}
