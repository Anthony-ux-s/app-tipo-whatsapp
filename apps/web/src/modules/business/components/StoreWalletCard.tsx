import type { StoreWalletEntry } from '@parla/types';
import { ArrowDownToLine, Banknote, CalendarClock } from 'lucide-react';
import { Button } from '@shared/ui/Button';
import { Field } from '@shared/ui/Field';
import { ErrorState } from '@shared/ui/States';
import { formatListTimestamp } from '@shared/utils/date';
import { formatSoles } from '@shared/utils/money';
import { useStoreWallet } from '../hooks/use-store-wallet.hook';

const ENTRY_LABELS: Record<StoreWalletEntry['kind'], string> = {
  sale: 'Venta entregada',
  commission: 'Comisión de Parla',
  payout: 'Depósito a tu PagaYa',
};

/**
 * «Mis ventas y depósitos»: lo que Parla le debe a la tienda (productos entregados menos su comisión), su número de PagaYa,
 * el depósito automático diario y «Retirar ahora». Abajo, cada movimiento.
 */
export function StoreWalletCard() {
  const w = useStoreWallet();
  if (w.error) return <ErrorState message={w.error} onRetry={w.retry} />;
  if (!w.wallet) return <div className="h-40 animate-pulse rounded-2xl bg-surface-3" />;
  const { wallet } = w;

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-surface p-4 shadow-float md:p-5" aria-label="Mis ventas y depósitos" data-testid="store-wallet">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink-soft">Saldo para depositar</p>
          <p className="text-3xl font-extrabold text-ink" data-testid="store-wallet-balance">
            {formatSoles(wallet.balanceCents)}
          </p>
          {wallet.pendingPayoutCents > 0 && <p className="text-xs text-ink-soft">{formatSoles(wallet.pendingPayoutCents)} en camino a tu PagaYa</p>}
        </div>
        <Button icon={<ArrowDownToLine className="size-4" />} onClick={w.withdraw} loading={w.withdrawing} disabled={!w.canWithdraw} data-testid="store-withdraw">
          Retirar ahora
        </Button>
      </div>

      <p className="flex items-start gap-2 rounded-xl bg-teal-50 p-3 text-xs text-ink dark:bg-teal-950/40">
        <CalendarClock className="mt-0.5 size-4 shrink-0 text-brand" />
        <span>
          Cobras el precio de tus productos entregados menos la comisión de Parla (<strong>{wallet.commissionPercent} %</strong>); el delivery y la
          propina son del repartidor. Te depositamos automáticamente cada día a las {wallet.autoPayoutAt} si tienes {formatSoles(wallet.minAutoPayoutCents)} o más.
        </span>
      </p>

      <div className="flex items-end gap-2">
        <Field
          label="Tu número de PagaYa"
          placeholder="9XX XXX XXX"
          inputMode="tel"
          value={w.phone}
          maxLength={15}
          onChange={(e) => w.onPhoneChange(e.target.value)}
          error={w.phoneError ?? undefined}
          className="flex-1"
          data-testid="store-payout-phone"
        />
        {w.phoneChanged && (
          <Button variant="secondary" onClick={w.savePhone} loading={w.savingPhone} className="mb-0.5 h-12" data-testid="store-save-payout-phone">
            Guardar
          </Button>
        )}
      </div>

      {wallet.entries.length > 0 && (
        <ul className="divide-y divide-line border-t border-line" aria-label="Movimientos">
          {wallet.entries.map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-2.5 text-sm" data-testid="store-ledger-entry">
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
