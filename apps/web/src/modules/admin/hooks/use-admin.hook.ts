import type { AdminClaim, AdminDriver, DriverStatus } from '@parla/types';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useSessionStore } from '@shared/stores/session.store';
import { toast } from '@shared/stores/toast.store';
import { errorMessage, http } from '@shared/utils/http';

export type AdminTab = 'pedidos' | 'personas' | 'trafico' | 'tarifas' | 'tiendas' | 'repartidores' | 'reclamos' | 'cupones' | 'marketing';
export type ClaimsView = 'open' | 'resolved';

/** Datos del panel de soporte que se vuelven a pedir al cambiar el filtro (o tras una acción). */
export function useAdminData<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    setError(null);
    http
      .get<T>(path)
      .then(setData)
      .catch((err) => setError(errorMessage(err)));
  }, [path]);
  useEffect(() => {
    setData(null);
    reload();
  }, [reload]);
  return { data, error, reload };
}

/** Lista del panel de soporte. */
export function useAdminList<T>(path: string) {
  const { data, error, reload } = useAdminData<T[]>(path);
  return { items: data, error, reload };
}

/** Panel de soporte de Parla: verificar repartidores y resolver reclamos (solo cuentas de soporte). */
export function useAdmin() {
  const navigate = useNavigate();
  const isAdmin = useSessionStore((s) => !!s.user?.isAdmin);
  const [tab, setTab] = useState<AdminTab>('pedidos');
  const [driverStatus, setDriverStatus] = useState<DriverStatus>('pending');
  const [claimsView, setClaimsView] = useState<ClaimsView>('open');
  const drivers = useAdminList<AdminDriver>(`/admin/drivers?status=${driverStatus}`);
  const claims = useAdminList<AdminClaim>(`/admin/claims?view=${claimsView}`);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<unknown>, done: string, after: () => void) => {
    setBusy(key);
    try {
      await fn();
      toast(done, 'success');
      after();
      return true;
    } catch (err) {
      toast(errorMessage(err), 'error');
      return false;
    } finally {
      setBusy(null);
    }
  };

  return {
    isAdmin,
    tab,
    selectTab: setTab,
    back: () => navigate('/app/ajustes'),
    busy,
    driverStatus,
    setDriverStatus,
    drivers,
    claimsView,
    setClaimsView,
    claims,
    reviewDriver: (userId: string, decision: 'approve' | 'reject', note = '') =>
      run(
        `driver:${userId}`,
        () => http.post<AdminDriver>(`/admin/drivers/${encodeURIComponent(userId)}/review`, { decision, note }),
        decision === 'approve' ? 'Repartidor aprobado: ya puede conectarse.' : 'Rechazado: le avisamos el motivo.',
        drivers.reload,
      ),
    refundClaim: (claimId: string, amountCents: number) =>
      run(`claim:${claimId}`, () => http.post<AdminClaim>(`/admin/claims/${encodeURIComponent(claimId)}/refund`, { amountCents }), 'Devolución hecha en PagaYa.', claims.reload),
    rejectClaim: (claimId: string, note: string) =>
      run(`claim:${claimId}`, () => http.post<AdminClaim>(`/admin/claims/${encodeURIComponent(claimId)}/reject`, { note }), 'Reclamo cerrado: le avisamos al cliente.', claims.reload),
  };
}
