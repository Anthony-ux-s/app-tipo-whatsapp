import type { Order } from '@parla/types';
import { Send } from 'lucide-react';
import { useState } from 'react';
import { useOrdersStore } from '@shared/stores/orders.store';
import { toast } from '@shared/stores/toast.store';
import { Button } from '@shared/ui/Button';
import { StarPicker, Stars } from '@shared/ui/Stars';
import { errorMessage, http } from '@shared/utils/http';

/**
 * Al recibir el pedido (como en Rappi): calificar al repartidor y a la tienda, con un comentario
 * opcional. Una sola vez; después se muestra lo que se calificó.
 */
export function RateOrderCard({ order }: { order: Order }) {
  const [driverStars, setDriverStars] = useState<number | null>(null);
  const [storeStars, setStoreStars] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  if (order.status !== 'delivered') return null;

  if (order.rating) {
    return (
      <section className="flex flex-col gap-2 rounded-2xl bg-surface p-4 shadow-float md:p-5" aria-label="Tu calificación" data-testid="order-rated">
        <p className="font-bold text-ink">¡Gracias por calificar!</p>
        {order.rating.driverStars && (
          <p className="flex items-center justify-between gap-3 text-sm text-ink-soft">
            {order.delivery?.driverName ?? 'Repartidor'} <Stars value={order.rating.driverStars} />
          </p>
        )}
        {order.rating.storeStars && (
          <p className="flex items-center justify-between gap-3 text-sm text-ink-soft">
            {order.business?.name ?? 'Tienda'} <Stars value={order.rating.storeStars} />
          </p>
        )}
        {order.rating.comment && <p className="text-sm text-ink">«{order.rating.comment}»</p>}
      </section>
    );
  }

  const send = async () => {
    setSending(true);
    try {
      const rated = await http.post<Order>(`/orders/${encodeURIComponent(order.id)}/rating`, { driverStars, storeStars, comment });
      useOrdersStore.getState().upsert(rated);
      toast('¡Gracias! Tu calificación ayuda a los repartidores y a la tienda.', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-surface p-4 shadow-float md:p-5" aria-label="Califica tu pedido" data-testid="rate-order">
      <p className="font-bold text-ink">¿Cómo te fue?</p>
      {order.delivery?.driverName && (
        <div className="flex flex-col gap-1">
          <span className="text-sm text-ink-soft">{order.delivery.driverName} (repartidor)</span>
          <StarPicker value={driverStars} onChange={setDriverStars} label="Calificación del repartidor" />
        </div>
      )}
      {order.business && (
        <div className="flex flex-col gap-1">
          <span className="text-sm text-ink-soft">{order.business.name} (tienda)</span>
          <StarPicker value={storeStars} onChange={setStoreStars} label="Calificación de la tienda" />
        </div>
      )}
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value.slice(0, 300))}
        placeholder="Cuéntanos algo (opcional)"
        aria-label="Comentario"
        rows={2}
        className="w-full resize-none rounded-[var(--radius-card)] border border-line bg-surface px-3.5 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-faint focus:border-teal-500 focus:ring-4 focus:ring-teal-500/15"
      />
      <Button icon={<Send className="size-4" />} onClick={send} loading={sending} disabled={driverStars === null && storeStars === null} className="self-start" data-testid="send-rating">
        Enviar calificación
      </Button>
    </section>
  );
}
