import type { PayoutResult, StoreWallet } from '@parla/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from '@shared/stores/toast.store';
import { errorMessage, http } from '@shared/utils/http';
import { formatSoles } from '@shared/utils/money';

const KEY = ['business', 'wallet'] as const;
/** Lo mínimo para «Retirar ahora» (el servidor lo vuelve a comprobar). */
const MIN_MANUAL_CENTS = 100;

/** «Mis ventas y depósitos» de la tienda: saldo, comisión, número de PagaYa y «Retirar ahora». */
export function useStoreWallet() {
  const queryClient = useQueryClient();
  const wallet = useQuery({ queryKey: KEY, queryFn: () => http.get<StoreWallet>('/business/wallet'), staleTime: 0 });
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const saved = wallet.data?.payoutPhone ?? '';
  useEffect(() => setPhone(saved), [saved]); // se rellena con el número guardado

  const savePhone = useMutation({
    mutationFn: () => http.put<{ payoutPhone: string }>('/business/payout-phone', { phone }),
    onSuccess: () => {
      setPhoneError(null);
      toast('Número de PagaYa guardado.', 'success');
      return queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (err) => setPhoneError(errorMessage(err)),
  });
  const withdraw = useMutation({
    mutationFn: () => http.post<PayoutResult>('/business/payouts'),
    onSuccess: (result) => {
      toast(`Te depositamos ${formatSoles(result.amountCents)} en tu PagaYa.`, 'success');
      return queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  const data = wallet.data ?? null;
  return {
    wallet: data,
    loading: wallet.isPending,
    error: wallet.isError && !data ? errorMessage(wallet.error) : null,
    retry: () => void wallet.refetch(),
    phone,
    phoneError,
    phoneChanged: phone.replace(/\D/g, '') !== saved,
    onPhoneChange: (value: string) => {
      setPhoneError(null);
      setPhone(value);
    },
    savePhone: () => savePhone.mutate(),
    savingPhone: savePhone.isPending,
    withdraw: () => withdraw.mutate(),
    withdrawing: withdraw.isPending,
    canWithdraw: Boolean(data?.payoutPhone) && (data?.balanceCents ?? 0) >= MIN_MANUAL_CENTS && !withdraw.isPending,
  };
}
