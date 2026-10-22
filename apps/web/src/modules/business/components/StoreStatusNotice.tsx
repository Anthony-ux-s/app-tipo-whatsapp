import type { BusinessInfo } from '@parla/types';
import { Hourglass, OctagonAlert } from 'lucide-react';

/** Aviso del estado de la tienda cuando todavía no recibe pedidos: en revisión, rechazada o suspendida. */
export function StoreStatusNotice({ business }: { business: BusinessInfo }) {
  if (business.status === 'approved') return null;
  const pending = business.status === 'pending';
  const Icon = pending ? Hourglass : OctagonAlert;
  const title = pending ? 'Tu tienda está en revisión' : business.status === 'rejected' ? 'Tu tienda no fue aprobada' : 'Tu tienda está suspendida';
  return (
    <div
      role="status"
      data-testid="store-status-notice"
      data-status={business.status}
      className={`flex items-start gap-3 rounded-2xl p-4 ring-1 ${pending ? 'bg-amber-50 ring-amber-200 dark:bg-amber-950/40 dark:ring-amber-900' : 'bg-rose-50 ring-rose-200 dark:bg-rose-950/40 dark:ring-rose-900'}`}
    >
      <Icon className={`mt-0.5 size-5 shrink-0 ${pending ? 'text-amber-700 dark:text-amber-300' : 'text-rose-700 dark:text-rose-300'}`} />
      <div className="min-w-0 text-sm text-ink">
        <p className="font-bold">{title}</p>
        {pending ? (
          <p className="mt-0.5 text-ink-soft">Nuestro equipo revisa tus datos. Mientras tanto puedes completar la información y preparar tus productos; te avisaremos cuando esté aprobada.</p>
        ) : (
          <>
            {business.reviewNote && (
              <p className="mt-0.5 text-ink-soft">
                Motivo: <span className="font-semibold text-ink">{business.reviewNote}</span>
              </p>
            )}
            <p className="mt-0.5 text-ink-soft">Corrige lo que te indicamos en los datos de tu tienda o escríbenos a soporte si tienes dudas.</p>
          </>
        )}
      </div>
    </div>
  );
}
