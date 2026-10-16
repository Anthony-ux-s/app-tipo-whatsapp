import { CreditCard, FlaskConical, Lock } from 'lucide-react';
import { Button } from '@shared/ui/Button';
import { Logo } from '@shared/ui/Logo';
import { ErrorState, FullScreenLoader } from '@shared/ui/States';
import { formatMoney } from '@shared/utils/money';
import { useSandboxCheckout } from '../hooks/use-sandbox-checkout.hook';

const input = 'h-11 w-full rounded-[var(--radius-card)] border border-line bg-surface-2 px-3 font-mono text-[15px] text-ink-soft';

/** Pago de prueba (modo sandbox): se ve como un checkout real, pero no cobra nada. */
export function SandboxCheckoutView() {
  const pay = useSandboxCheckout();
  if (!pay.checkout && !pay.error) return <FullScreenLoader label="Preparando el pago…" />;

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-gradient-to-br from-teal-50 via-canvas to-cyan-50 px-4 py-10 dark:from-teal-950 dark:via-canvas dark:to-cyan-950">
      <Logo className="mb-6" />
      <div className="w-full max-w-md animate-rise overflow-hidden rounded-2xl bg-surface shadow-pop ring-1 ring-line">
        <p className="flex items-center justify-center gap-2 bg-cyan-100 px-4 py-2 text-xs font-semibold text-cyan-900 dark:bg-cyan-900/60 dark:text-cyan-100">
          <FlaskConical className="size-4" /> Pago de prueba: no se cobrará nada
        </p>
        {pay.error || !pay.checkout ? (
          <div className="p-6">
            <ErrorState message={pay.error ?? 'Pago no disponible'} />
            <Button variant="secondary" fullWidth onClick={pay.back}>Volver</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-ink-soft">{pay.checkout.workspaceName}</p>
                <h1 className="text-xl font-extrabold text-ink">Plan {pay.checkout.plan.name} · 1 mes</h1>
              </div>
              <p className="font-display text-2xl font-extrabold text-ink" data-testid="checkout-amount">
                {formatMoney(pay.checkout.amount, pay.checkout.currency)}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-ink" htmlFor="card">Tarjeta</label>
              <div className="relative">
                <CreditCard className="absolute top-3 left-3 size-5 text-ink-faint" />
                <input id="card" readOnly value={pay.card.number} className={`${input} pl-11`} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input readOnly aria-label="Vencimiento" value={pay.card.expiry} className={input} />
                <input readOnly aria-label="Código de seguridad" value={pay.card.cvc} className={input} />
              </div>
            </div>
            {pay.checkout.status !== 'pending' ? (
              <p className="rounded-[var(--radius-card)] bg-surface-3 p-3 text-center text-sm text-ink-soft">Este pago ya se procesó.</p>
            ) : (
              <>
                <Button size="lg" fullWidth loading={pay.busy === 'approve'} disabled={pay.busy !== null} onClick={pay.approve} icon={<Lock className="size-4" />}>
                  Pagar {formatMoney(pay.checkout.amount, pay.checkout.currency)}
                </Button>
                <Button variant="ghost" fullWidth loading={pay.busy === 'reject'} disabled={pay.busy !== null} onClick={pay.reject}>
                  Simular pago rechazado
                </Button>
              </>
            )}
            <p className="text-center text-xs text-ink-faint">
              En producción este paso lo hace MercadoPago (tarjeta, PSE, Nequi…). Parla nunca ve los datos de tu tarjeta.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
