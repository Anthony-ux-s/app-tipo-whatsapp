import type { AdminClaim, AdminDriver, DriverStatus } from '@parla/types';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useSessionStore } from '@shared/stores/session.store';
import { toast } from '@shared/stores/toast.store';
import { errorMessage, http } from '@shared/utils/http';
import { ADMIN_TABS, DEFAULT_ADMIN_TAB } from '../const/admin-nav.const';

export type AdminTab = 'pedidos' | 'personas' | 'trafico' | 'tarifas' | 'tiendas' | 'repartidores' | 'reclamos' | 'cupones' | 'marketing';
export type ClaimsView = 'open' | 'resolved';

/**
 * Datos del panel de soporte: se muestra al instante lo último que se vio y se vuelve a pedir por detrás
 * (siempre «viejo» para que el soporte vea datos frescos). `reload` los refresca tras una acción.
 */
export function useAdminData<T>(path: string) {
  const query = useQuery({ queryKey: ['admin', path], queryFn: () => http.get<T>(path), staleTime: 0 });
  return {
    data: query.data ?? null,
    error: query.data === undefined && query.error ? errorMessage(query.error) : null,
    reload: () => void query.refetch(),
  };
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
  const { section } = useParams();
  const tab: AdminTab = ADMIN_TABS.find((id) => id === section) ?? DEFAULT_ADMIN_TAB;
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
    selectTab: (id: AdminTab) => navigate(`/app/admin/${id}`),
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
    recordCommissionPayment: (userId: string, amountCents: number) =>
      run(
        `driver:${userId}`,
        () => http.post<{ debtCents: number }>(`/admin/drivers/${encodeURIComponent(userId)}/commission-payments`, { amountCents }),
        'Pago de comisión anotado.',
        drivers.reload,
      ),
    refundClaim: (claimId: string, amountCents: number) =>
      run(`claim:${claimId}`, () => http.post<AdminClaim>(`/admin/claims/${encodeURIComponent(claimId)}/refund`, { amountCents }), 'Devolución hecha en PagaYa.', claims.reload),
    rejectClaim: (claimId: string, note: string) =>
      run(`claim:${claimId}`, () => http.post<AdminClaim>(`/admin/claims/${encodeURIComponent(claimId)}/reject`, { note }), 'Reclamo cerrado: le avisamos al cliente.', claims.reload),
  };
}
