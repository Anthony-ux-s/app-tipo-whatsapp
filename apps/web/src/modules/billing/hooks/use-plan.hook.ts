import type { BillingOverview, CheckoutSession, PaidPlanId, Plan } from '@parla/types';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { toast } from '@shared/stores/toast.store';
import { useWorkspaceStore } from '@shared/stores/workspace.store';
import { errorMessage, http } from '@shared/utils/http';

/** Plan del espacio: catálogo, plan vigente, vencimiento, historial y botón de pago (administradores). */
export function usePlan() {
  const { workspaceId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const workspace = useWorkspaceStore((s) => s.workspaces.find((w) => w.id === workspaceId) ?? null);
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces);
  const isAdmin = workspace?.role === 'admin';
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [paying, setPaying] = useState<PaidPlanId | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    const load = isAdmin
      ? http.get<BillingOverview>(`/admin/billing/${workspaceId}`).then((o) => {
          if (!alive) return;
          setOverview(o);
          setPlans(o.plans);
        })
      : http.get<Plan[]>('/billing/plans').then((p) => alive && setPlans(p));
    load.then(() => alive && setStatus('ready')).catch(() => alive && setStatus('error'));
    return () => {
      alive = false;
    };
  }, [workspaceId, isAdmin, attempt]);

  // Vuelta desde la pasarela (?pago=<id>): se informa el resultado y se refresca el plan.
  const returned = searchParams.get('pago');
  useEffect(() => {
    if (!returned || !overview) return;
    const payment = overview.payments.find((p) => p.id === returned);
    if (payment?.status === 'approved') toast('¡Pago aprobado! Tu plan ya está activo.', 'success');
    else if (payment?.status === 'rejected') toast('El pago fue rechazado. No se hizo ningún cobro.', 'error');
    else if (payment) toast('Tu pago está en proceso. Te avisaremos cuando se confirme.', 'info');
    void loadWorkspaces().catch(() => undefined);
    setSearchParams({}, { replace: true });
  }, [returned, overview, loadWorkspaces, setSearchParams]);

  const current = overview?.effectivePlan ?? workspace?.plan ?? 'free';

  return {
    workspace,
    isAdmin,
    status,
    plans,
    current,
    expiresAt: overview?.expiresAt ?? workspace?.planExpiresAt ?? null,
    memberCount: overview?.memberCount ?? workspace?.memberCount ?? 0,
    payments: overview?.payments ?? [],
    sandbox: overview?.provider === 'sandbox',
    paying,
    retry: () => setAttempt((n) => n + 1),
    choose: async (plan: PaidPlanId) => {
      setPaying(plan);
      try {
        const session = await http.post<CheckoutSession>(`/admin/billing/${workspaceId}/checkout`, { plan });
        window.location.assign(session.checkoutUrl);
      } catch (err) {
        toast(errorMessage(err), 'error');
        setPaying(null);
      }
    },
  };
}
