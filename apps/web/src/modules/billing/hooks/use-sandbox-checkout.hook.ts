import type { SandboxCheckout } from '@parla/types';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { errorMessage, http } from '@shared/utils/http';
import { SANDBOX_CARD } from '../const/billing.const';

/** Pantalla de pago simulado: aprueba o rechaza el pago sin cobrar nada. */
export function useSandboxCheckout() {
  const { paymentId = '' } = useParams();
  const navigate = useNavigate();
  const [checkout, setCheckout] = useState<SandboxCheckout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);

  useEffect(() => {
    let alive = true;
    http
      .get<SandboxCheckout>(`/admin/billing/sandbox/${paymentId}`)
      .then((c) => alive && setCheckout(c))
      .catch((err) => alive && setError(errorMessage(err)));
    return () => {
      alive = false;
    };
  }, [paymentId]);

  const finish = async (action: 'approve' | 'reject') => {
    setBusy(action);
    try {
      const result = await http.post<SandboxCheckout>(`/admin/billing/sandbox/${paymentId}/${action}`);
      navigate(`/app/w/${result.workspaceId}/plan?pago=${paymentId}`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  };

  return {
    checkout,
    error,
    busy,
    card: SANDBOX_CARD,
    approve: () => finish('approve'),
    reject: () => finish('reject'),
    back: () => navigate(checkout ? `/app/w/${checkout.workspaceId}/plan` : '/app'),
  };
}
