import type { ClaimReason, CreateClaimRequest, Order, OrderClaim } from '@parla/types';
import { LifeBuoy, Minus, Plus, Send } from 'lucide-react';
import { useState } from 'react';
import { useOrdersStore } from '@shared/stores/orders.store';
import { toast } from '@shared/stores/toast.store';
import { Button } from '@shared/ui/Button';
import { TextAreaField } from '@shared/ui/Field';
import { Modal } from '@shared/ui/Modal';
import { PhotoPicker, PrivatePhoto } from '@shared/ui/PrivatePhoto';
import { formatLongDate, formatSoles } from '@shared/utils/money';
import { errorMessage, http } from '@shared/utils/http';
import { CLAIM_REASON_LABEL, CLAIM_REASONS, CLAIM_STATUS_LABEL } from '../const/services.const';

/** Como en Rappi: se reclama hasta 48 horas después de recibir el pedido. */
const CLAIM_WINDOW_MS = 48 * 3_600_000;

/**
 * «Tengo un problema con mi pedido»: después de recibirlo, la clienta marca qué pasó y qué productos,
 * con una foto opcional; soporte lo revisa y le devuelve una parte o todo. Aquí ve cómo va.
 */
export function ClaimCard({ order }: { order: Order }) {
  const [open, setOpen] = useState(false);
  if (order.status !== 'delivered') return null;
  const claims = order.claims ?? [];
  const deliveredAt = order.timeline.find((t) => t.status === 'delivered')?.at;
  const pending = claims.some((c) => c.status === 'open' || c.status === 'refunding');
  const inTime = !!deliveredAt && Date.now() - new Date(deliveredAt).getTime() <= CLAIM_WINDOW_MS;
  const refunded = claims.reduce((sum, c) => sum + (c.status === 'refunded' ? (c.refundCents ?? 0) : 0), 0);
  const canClaim = !pending && inTime && !order.payment.refundedAt && refunded < order.totalCents;

  return (
    <>
      {claims.map((claim) => (
        <ClaimStatusCard key={claim.id} order={order} claim={claim} />
      ))}
      {canClaim && (
        <Button variant="ghost" className="self-center" icon={<LifeBuoy className="size-4" />} onClick={() => setOpen(true)} data-testid="open-claim">
          Tengo un problema con mi pedido
        </Button>
      )}
      {open && <ClaimForm order={order} maxCents={order.totalCents - refunded} onClose={() => setOpen(false)} />}
    </>
  );
}

function ClaimStatusCard({ order, claim }: { order: Order; claim: OrderClaim }) {
  const tone =
    claim.status === 'refunded'
      ? 'bg-emerald-50 ring-emerald-200 dark:bg-emerald-950/40 dark:ring-emerald-900'
      : claim.status === 'rejected'
        ? 'bg-surface-3 ring-line'
        : 'bg-amber-50 ring-amber-200 dark:bg-amber-950/40 dark:ring-amber-900';
  return (
    <section className={`flex flex-col gap-2 rounded-2xl p-4 ring-1 md:p-5 ${tone}`} aria-label="Tu reclamo" data-testid="claim-status" data-status={claim.status}>
      <p className="flex items-center justify-between gap-3">
        <span className="font-bold text-ink">Reclamo · {CLAIM_REASON_LABEL[claim.reason]}</span>
        <span className="shrink-0 text-xs font-bold text-ink-soft">{CLAIM_STATUS_LABEL[claim.status]}</span>
      </p>
      {claim.items.length > 0 && <p className="text-sm text-ink-soft">{claim.items.map((i) => `${i.quantity}× ${i.name}`).join(' · ')}</p>}
      {claim.comment && <p className="text-sm text-ink">«{claim.comment}»</p>}
      <p className="text-sm text-ink-soft">
        {claim.status === 'refunded'
          ? `Te devolvimos ${formatSoles(claim.refundCents ?? 0)} a tu billetera ${order.payment.provider}.`
          : claim.status === 'rejected'
            ? claim.resolutionNote || 'Soporte revisó tu caso y no procede la devolución.'
            : claim.status === 'refunding'
              ? `Estamos devolviendo ${formatSoles(claim.refundCents ?? 0)} a tu billetera.`
              : `Soporte lo está revisando. Devolución sugerida: ${formatSoles(claim.suggestedCents)}.`}
      </p>
      {claim.hasPhoto && <PrivatePhoto path={`/orders/${encodeURIComponent(order.id)}/claims/${encodeURIComponent(claim.id)}/photo`} alt="Foto del reclamo" />}
      <p className="text-xs text-ink-faint">{formatLongDate(claim.createdAt)}</p>
    </section>
  );
}

function ClaimForm({ order, maxCents, onClose }: { order: Order; maxCents: number; onClose: () => void }) {
  const [reason, setReason] = useState<ClaimReason | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsItems = CLAIM_REASONS.find((r) => r.id === reason)?.needsItems ?? false;
  const items = Object.entries(quantities)
    .filter(([, q]) => q > 0)
    .map(([productId, quantity]) => ({ productId, quantity }));
  const suggested = Math.min(
    maxCents,
    needsItems
      ? order.lines.reduce((sum, l) => sum + Math.round((l.totalCents / l.quantity) * (quantities[l.productId] ?? 0)), 0)
      : reason === 'not_delivered'
        ? maxCents
        : 0,
  );

  const change = (productId: string, max: number, delta: number) => {
    setQuantities((q) => ({ ...q, [productId]: Math.min(max, Math.max(0, (q[productId] ?? 0) + delta)) }));
    setError(null);
  };

  const send = async () => {
    if (!reason) return setError('Elige qué pasó con tu pedido');
    if (needsItems && items.length === 0) return setError('Marca qué productos tuvieron el problema');
    if (reason === 'other' && !comment.trim()) return setError('Cuéntanos qué pasó');
    const body: CreateClaimRequest = { reason, ...(needsItems ? { items } : {}), comment: comment.trim(), ...(photoId ? { photoId } : {}) };
    setSending(true);
    try {
      await http.post<OrderClaim>(`/orders/${encodeURIComponent(order.id)}/claims`, body);
      await useOrdersStore.getState().loadOrder(order.id);
      toast('Recibimos tu reclamo. Soporte lo revisará pronto.', 'success');
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="¿Qué pasó con tu pedido?"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Volver</Button>
          <Button icon={<Send className="size-4" />} onClick={send} loading={sending} data-testid="send-claim">
            Enviar reclamo
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div role="radiogroup" aria-label="Motivo" className="flex flex-col gap-1.5">
          {CLAIM_REASONS.map((r) => (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={reason === r.id}
              onClick={() => {
                setReason(r.id);
                setError(null);
              }}
              className={`rounded-xl px-3.5 py-2.5 text-left text-sm font-semibold transition-colors duration-200 ${reason === r.id ? 'bg-teal-100 text-teal-900 ring-2 ring-teal-500 dark:bg-teal-900/60 dark:text-teal-100' : 'bg-surface-3 text-ink-soft hover:text-ink'}`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {needsItems && (
          <div className="flex flex-col gap-2" aria-label="Productos con problema">
            <p className="text-sm font-medium text-ink">¿Qué productos y cuántos?</p>
            {order.lines.map((line) => {
              const q = quantities[line.productId] ?? 0;
              return (
                <div key={line.productId} className="flex items-center justify-between gap-3 text-sm" data-testid="claim-line">
                  <span className="min-w-0 text-ink">
                    {line.name} <span className="text-ink-faint">· pediste {line.quantity}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <button type="button" aria-label={`Menos ${line.name}`} onClick={() => change(line.productId, line.quantity, -1)} disabled={q === 0} className="flex size-8 items-center justify-center rounded-full bg-surface-3 text-ink disabled:opacity-40">
                      <Minus className="size-4" />
                    </button>
                    <span className="w-5 text-center font-bold text-ink">{q}</span>
                    <button type="button" aria-label={`Más ${line.name}`} onClick={() => change(line.productId, line.quantity, 1)} disabled={q === line.quantity} className="flex size-8 items-center justify-center rounded-full bg-surface-3 text-ink disabled:opacity-40">
                      <Plus className="size-4" />
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {reason && (
          <>
            <TextAreaField label={reason === 'other' ? 'Cuéntanos qué pasó' : 'Comentario (opcional)'} value={comment} maxLength={500} onChange={(e) => setComment(e.target.value)} />
            <PhotoPicker label="Foto (opcional)" hint="Una foto ayuda a resolverlo más rápido." onChange={setPhotoId} testId="claim-photo" />
          </>
        )}

        {suggested > 0 && (
          <p className="text-sm text-ink-soft" data-testid="claim-suggested">
            Te devolveríamos hasta <span className="font-bold text-ink">{formatSoles(suggested)}</span>; soporte lo confirma.
          </p>
        )}
        {error && <p role="alert" className="text-sm font-semibold text-rose-700 dark:text-rose-400">{error}</p>}
      </div>
    </Modal>
  );
}
