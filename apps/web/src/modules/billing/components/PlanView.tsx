import { Check, CreditCard, Crown, Receipt, ShieldCheck } from 'lucide-react';
import { Button } from '@shared/ui/Button';
import { ErrorState, ListSkeleton } from '@shared/ui/States';
import { formatLongDate, formatMoney } from '@shared/utils/money';
import { PAYMENT_STATUS_LABELS, PLAN_ACCENTS } from '../const/billing.const';
import { usePlan } from '../hooks/use-plan.hook';

/** Planes y facturación del espacio de trabajo. */
export function PlanView() {
  const plan = usePlan();
  if (plan.status === 'error') return <div className="flex flex-1 items-center justify-center"><ErrorState message="No pudimos cargar los planes." onRetry={plan.retry} /></div>;
  if (plan.status === 'loading' || !plan.workspace) return <div className="flex-1 bg-surface"><ListSkeleton /></div>;
  const currentPlan = plan.plans.find((p) => p.id === plan.current);

  return (
    <div className="flex-1 overflow-y-auto bg-canvas">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-3 sm:p-4 md:gap-6 md:p-6 lg:p-8">
        <header className={`flex flex-col gap-3 rounded-2xl bg-gradient-to-br p-5 text-white shadow-float sm:flex-row sm:items-center md:p-6 ${PLAN_ACCENTS[plan.current]}`}>
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/15">
            <Crown className="size-6" />
          </span>
          <div className="flex-1">
            <p className="text-sm text-white/80">{plan.workspace.name}</p>
            <h1 className="text-xl font-extrabold md:text-2xl" data-testid="current-plan">
              Plan {currentPlan?.name ?? 'Gratis'}
            </h1>
            <p className="text-sm text-white/85">
              {plan.memberCount} de {currentPlan?.maxMembers ?? '∞'} miembros
              {plan.expiresAt ? ` · vigente hasta el ${formatLongDate(plan.expiresAt)}` : ''}
            </p>
          </div>
          {plan.sandbox && plan.isAdmin && (
            <span className="self-start rounded-full bg-white/15 px-3 py-1 text-xs font-semibold sm:self-center">Pagos en modo de prueba</span>
          )}
        </header>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-3" aria-label="Planes">
          {plan.plans.map((p) => {
            const isCurrent = p.id === plan.current;
            const tooSmall = p.maxMembers !== null && plan.memberCount > p.maxMembers;
            return (
              <article
                key={p.id}
                data-testid={`plan-${p.id}`}
                className={`relative flex flex-col rounded-2xl bg-surface p-5 shadow-float ring-1 transition-all duration-200 ${isCurrent ? 'ring-2 ring-teal-500' : 'ring-line hover:-translate-y-0.5 hover:shadow-pop'}`}
              >
                {p.id === 'team' && !isCurrent && (
                  <span className="absolute -top-3 left-5 rounded-full bg-emerald-500 px-3 py-1 text-xs font-bold text-white">Más elegido</span>
                )}
                <h2 className="text-lg font-extrabold text-ink">{p.name}</h2>
                <p className="text-sm text-ink-soft">{p.tagline}</p>
                <p className="mt-4 font-display text-3xl font-extrabold text-ink">
                  {p.monthlyPrice ? formatMoney(p.monthlyPrice, p.currency) : 'Gratis'}
                  {p.monthlyPrice > 0 && <span className="block text-sm font-medium text-ink-soft">al mes, por espacio</span>}
                </p>
                <ul className="mt-4 flex flex-1 flex-col gap-2">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2 text-sm text-ink">
                      <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" /> {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-5">
                  {isCurrent ? (
                    <p className="flex h-11 items-center justify-center rounded-[var(--radius-card)] bg-teal-50 text-sm font-semibold text-teal-800 dark:bg-teal-950/60 dark:text-teal-200">
                      {p.id === 'free' ? 'Tu plan actual' : 'Plan activo'}
                    </p>
                  ) : p.id === 'free' ? (
                    <p className="text-center text-xs text-ink-faint">Al vencer un plan de pago, el espacio vuelve aquí sin perder nada.</p>
                  ) : plan.isAdmin ? (
                    <Button
                      fullWidth
                      icon={<CreditCard className="size-4" />}
                      loading={plan.paying === p.id}
                      disabled={tooSmall || plan.paying !== null}
                      onClick={() => plan.choose(p.id as 'team' | 'business')}
                    >
                      {tooSmall ? `Tienes más de ${p.maxMembers} miembros` : `Pagar 1 mes de ${p.name}`}
                    </Button>
                  ) : (
                    <p className="text-center text-xs text-ink-faint">Solo un administrador puede cambiar el plan.</p>
                  )}
                </div>
              </article>
            );
          })}
        </section>
        {plan.isAdmin && plan.current !== 'free' && (
          <p className="text-center text-xs text-ink-soft">Pagar otra vez el mismo plan antes de que venza suma un mes más al final del periodo.</p>
        )}

        {plan.isAdmin && (
          <section className="rounded-2xl bg-surface shadow-float">
            <h2 className="flex items-center gap-2 border-b border-line p-4 text-base font-bold text-ink md:px-6">
              <Receipt className="size-5 text-brand dark:text-teal-300" /> Historial de pagos
            </h2>
            {plan.payments.length === 0 ? (
              <p className="p-6 text-center text-sm text-ink-soft">Todavía no hay pagos. El plan Gratis no requiere ninguno.</p>
            ) : (
              <ul className="divide-y divide-line" data-testid="payments">
                {plan.payments.map((pay) => (
                  <li key={pay.id} className="flex flex-wrap items-center gap-3 px-4 py-3 md:px-6">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink">
                        Plan {plan.plans.find((p) => p.id === pay.plan)?.name} · 1 mes
                      </span>
                      <span className="block text-xs text-ink-soft">
                        {formatLongDate(pay.createdAt)} · {pay.provider === 'sandbox' ? 'Pago de prueba' : 'MercadoPago'} · ref. {pay.id.slice(-8)}
                      </span>
                    </span>
                    <span className="text-sm font-semibold text-ink">{formatMoney(pay.amount, pay.currency)}</span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${pay.status === 'approved' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200' : pay.status === 'pending' ? 'bg-cyan-100 text-cyan-900 dark:bg-cyan-900/50 dark:text-cyan-100' : 'bg-surface-3 text-ink-soft'}`}
                    >
                      {PAYMENT_STATUS_LABELS[pay.status]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <p className="flex items-start justify-center gap-2 pb-6 text-center text-xs text-ink-faint">
          <ShieldCheck className="size-4 shrink-0" />
          Pagos procesados por MercadoPago: Parla nunca ve ni guarda los datos de tu tarjeta. Sin cobros automáticos: cada pago cubre un mes.
        </p>
      </div>
    </div>
  );
}
