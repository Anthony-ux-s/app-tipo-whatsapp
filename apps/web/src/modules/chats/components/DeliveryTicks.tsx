import type { DeliveryStatus } from '@parla/types';
import { Check, CheckCheck, Clock3, TriangleAlert } from 'lucide-react';

interface DeliveryTicksProps {
  status: DeliveryStatus;
  local?: 'pending' | 'failed';
  className?: string;
}

const LABELS: Record<DeliveryStatus, string> = { sent: 'Enviado', delivered: 'Entregado', read: 'Leído' };

/** ✓ enviado · ✓✓ entregado · ✓✓ en cian: leído. */
export function DeliveryTicks({ status, local, className = 'size-4' }: DeliveryTicksProps) {
  if (local === 'pending') return <Clock3 className={`${className} text-ink-faint`} aria-label="Enviando" />;
  if (local === 'failed') return <TriangleAlert className={`${className} text-teal-900 dark:text-teal-200`} aria-label="No se envió" />;
  if (status === 'sent') return <Check className={`${className} text-ink-faint`} aria-label={LABELS.sent} />;
  return (
    <CheckCheck
      className={`${className} ${status === 'read' ? 'text-tick-read' : 'text-ink-faint'}`}
      aria-label={LABELS[status]}
      data-status={status}
    />
  );
}
