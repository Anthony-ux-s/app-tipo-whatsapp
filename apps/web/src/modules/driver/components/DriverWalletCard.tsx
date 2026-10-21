import type { LedgerEntry } from '@parla/types';
import { ArrowDownToLine, Banknote, CalendarClock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useDriverStore } from '@shared/stores/driver.store';
import { toast } from '@shared/stores/toast.store';
import { Button } from '@shared/ui/Button';
import { Field } from '@shared/ui/Field';
import { formatListTimestamp } from '@shared/utils/date';
import { errorMessage } from '@shared/utils/http';
import { formatSoles } from '@shared/utils/money';

const ENTRY_LABELS: Record<LedgerEntry['kind'], string> = {
  delivery_fee: 'Tarifa de delivery',
  commission: 'Comisión Rapidito',
  tip: 'Propina',
  payout: 'Depósito a tu PagaYa',
};

/**
 * Billetera del repartidor: lo que se le debe (ya descontada la comisión), su número de PagaYa, el
 * depósito automático diario y «Retirar ahora». Abajo, cada movimiento.
 */
export function DriverWalletCard() {
  const wallet = useDriverStore((s) => s.wallet);
  const loadWallet = useDriverStore((s) => s.loadWallet);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState<'phone' | 'withdraw' | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  useEffect(() => {
    void loadWallet().catch(() => undefined);
  }, [loadWallet]);
  useEffect(() => {
    if (wallet) setPhone(wallet.payoutPhone ?? '');
  }, [wallet?.payoutPhone]); // se rellena con el número guardado

  if (!wallet) return <div className="h-40 animate-pulse rounded-2xl bg-surface-3" />;

  const savePhone = async () => {
    setBusy('phone');
    setPhoneError(null);
    try {
      await useDriverStore.getState().setPayoutPhone(phone);
      toast('Número de PagaYa guardado.', 'success');
    } catch (err) {
      setPhoneError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  const withdraw = async () => {
    setBusy('withdraw');
    try {
      const r = await useDriverStore.getState().withdraw();
      toast(`Te depositamos ${formatSoles(r.amountCents)} en tu PagaYa.`, 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-surface p-4 shadow-float md:p-5" aria-label="Mi saldo" data-testid="driver-wallet">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink-soft">Saldo para depositar</p>
          <p className="text-3xl font-extrabold text-ink" data-testid="wallet-balance">{formatSoles(wallet.balanceCents)}</p>
          {wallet.pendingPayoutCents > 0 && <p className="text-xs text-ink-soft">{formatSoles(wallet.pendingPayoutCents)} en camino a tu PagaYa</p>}
        </div>
        <Button icon={<ArrowDownToLine className="size-4" />} onClick={withdraw} loading={busy === 'withdraw'} disabled={!wallet.payoutPhone || wallet.balanceCents < 100} data-testid="withdraw">
          Retirar ahora
        </Button>
      </div>

      <p className="flex items-start gap-2 rounded-xl bg-teal-50 p-3 text-xs text-ink dark:bg-teal-950/40">
        <CalendarClock className="mt-0.5 size-4 shrink-0 text-brand" />
        <span>
          Ganas el <strong>{wallet.driverSharePercent} %</strong> de cada tarifa de delivery y el <strong>100 % de las propinas</strong>; la comisión de
          Rapidito se descuenta sola. Te depositamos automáticamente cada día a las {wallet.autoPayoutAt} si tienes {formatSoles(wallet.minAutoPayoutCents)} o más.
        </span>
      </p>

      <div className="flex items-end gap-2">
        <Field
          label="Tu número de PagaYa"
          placeholder="9XX XXX XXX"
          inputMode="tel"
          value={phone}
          maxLength={15}
          onChange={(e) => setPhone(e.target.value)}
          error={phoneError}
          className="flex-1"
        />
        {phone.replace(/\D/g, '') !== (wallet.payoutPhone ?? '') && (
          <Button variant="secondary" onClick={savePhone} loading={busy === 'phone'} className="mb-0.5 h-12" data-testid="save-payout-phone">
            Guardar
          </Button>
        )}
      </div>

      {wallet.entries.length > 0 && (
        <ul className="divide-y divide-line border-t border-line" aria-label="Movimientos">
          {wallet.entries.map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-2.5 text-sm" data-testid="ledger-entry">
              <Banknote className={`size-4 shrink-0 ${e.amountCents >= 0 ? 'text-emerald-600' : 'text-ink-faint'}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-ink">
                  {ENTRY_LABELS[e.kind]}
                  {e.status === 'pending' && ' · en curso'}
                  {e.status === 'failed' && ' · falló (el saldo volvió)'}
                </span>
                <span className="block text-xs text-ink-faint">{formatListTimestamp(e.createdAt)}</span>
              </span>
              <span className={`font-semibold ${e.status === 'failed' ? 'text-ink-faint line-through' : e.amountCents >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-ink'}`}>
                {e.amountCents >= 0 ? '+' : '−'} {formatSoles(Math.abs(e.amountCents))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
