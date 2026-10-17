import type { AdminCoupon, CouponKind, CreateCouponRequest } from '@parla/types';
import { Plus, Tag } from 'lucide-react';
import { useState } from 'react';
import { toast } from '@shared/stores/toast.store';
import { Button } from '@shared/ui/Button';
import { Field } from '@shared/ui/Field';
import { Modal } from '@shared/ui/Modal';
import { EmptyState, ErrorState, ListSkeleton } from '@shared/ui/States';
import { EmptyChatsIllustration } from '@shared/ui/illustrations';
import { Toggle } from '@shared/ui/Toggle';
import { formatLongDate, formatSoles } from '@shared/utils/money';
import { errorMessage, http } from '@shared/utils/http';
import { useAdminList } from '../hooks/use-admin.hook';

const KINDS: { id: CouponKind; label: string }[] = [
  { id: 'free_delivery', label: 'Envío gratis' },
  { id: 'percent', label: '% en productos' },
  { id: 'amount', label: 'Monto fijo' },
];

function summary(c: AdminCoupon): string {
  const what = c.kind === 'free_delivery' ? 'Envío gratis' : c.kind === 'percent' ? `${c.value} % en productos${c.maxDiscountCents ? ` (hasta ${formatSoles(c.maxDiscountCents)})` : ''}` : `${formatSoles(c.value)} de descuento`;
  const rules = [
    c.minSubtotalCents > 0 && `desde ${formatSoles(c.minSubtotalCents)}`,
    c.firstOrderOnly && 'solo primer pedido',
    `${c.perUserLimit} ${c.perUserLimit === 1 ? 'uso' : 'usos'} por persona`,
    c.endsAt && `vence ${formatLongDate(c.endsAt)}`,
  ].filter(Boolean);
  return [what, ...rules].join(' · ');
}

/** Cupones de Parla: crearlos y pausarlos; se ve cuántas veces se usó cada uno. */
export function AdminCoupons() {
  const list = useAdminList<AdminCoupon>('/admin/coupons');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const setActive = async (c: AdminCoupon, active: boolean) => {
    setBusy(c.code);
    try {
      await http.post(`/admin/coupons/${encodeURIComponent(c.code)}/active`, { active });
      list.reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Button className="self-start" icon={<Plus className="size-4" />} onClick={() => setCreating(true)} data-testid="new-coupon">
        Nuevo cupón
      </Button>
      {list.error && !list.items ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : !list.items ? (
        <ListSkeleton rows={2} />
      ) : list.items.length === 0 ? (
        <EmptyState compact illustration={<EmptyChatsIllustration />} title="Sin cupones" description="Crea uno para regalar envío gratis o un descuento." />
      ) : (
        <ul className="flex flex-col gap-3" data-testid="admin-coupons">
          {list.items.map((c) => (
            <li key={c.code} className="flex flex-col gap-1 rounded-2xl bg-surface p-4 shadow-float md:p-5" data-testid="admin-coupon" data-code={c.code}>
              <p className="flex items-center gap-2 font-bold text-ink">
                <Tag className="size-4 text-brand dark:text-teal-300" /> <span className="font-mono">{c.code}</span>
              </p>
              <p className="text-sm text-ink">{c.description}</p>
              <p className="text-sm text-ink-soft">{summary(c)}</p>
              <p className="text-xs text-ink-faint">
                Usado {c.uses} {c.uses === 1 ? 'vez' : 'veces'}
                {c.maxUses ? ` de ${c.maxUses}` : ''}
              </p>
              <Toggle checked={c.active} onChange={(v) => void setActive(c, v)} disabled={busy === c.code} label={c.active ? 'Activo' : 'Pausado'} />
            </li>
          ))}
        </ul>
      )}
      {creating && (
        <CouponForm
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            list.reload();
          }}
        />
      )}
    </>
  );
}

const soles = (v: string) => Math.round(Number(v.replace(',', '.') || '0') * 100);

function CouponForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<CouponKind>('free_delivery');
  const [value, setValue] = useState('');
  const [maxDiscount, setMaxDiscount] = useState('');
  const [minSubtotal, setMinSubtotal] = useState('');
  const [firstOrderOnly, setFirstOrderOnly] = useState(false);
  const [perUser, setPerUser] = useState('1');
  const [maxUses, setMaxUses] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const body: CreateCouponRequest = {
      code,
      description,
      kind,
      ...(kind === 'percent' ? { value: Number(value || '0'), maxDiscountCents: maxDiscount ? soles(maxDiscount) : null } : {}),
      ...(kind === 'amount' ? { value: soles(value) } : {}),
      minSubtotalCents: soles(minSubtotal),
      firstOrderOnly,
      perUserLimit: Number(perUser || '1'),
      maxUses: maxUses ? Number(maxUses) : null,
      // Vence al final de ese día, hora de Lima.
      endsAt: endsAt ? new Date(`${endsAt}T23:59:59-05:00`).toISOString() : null,
    };
    setSaving(true);
    setError(null);
    try {
      await http.post('/admin/coupons', body);
      toast(`Cupón ${code} creado.`, 'success');
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Nuevo cupón"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Volver</Button>
          <Button onClick={save} loading={saving} data-testid="save-coupon">
            Crear cupón
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Código" placeholder="ej. VERANO10" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20))} autoCapitalize="characters" data-testid="coupon-code" />
        <Field label="Qué ofrece (lo ve el cliente)" placeholder="ej. 10 % en tu compra de verano" value={description} maxLength={120} onChange={(e) => setDescription(e.target.value)} data-testid="coupon-description" />
        <div role="radiogroup" aria-label="Tipo de cupón" className="grid grid-cols-3 gap-2">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              role="radio"
              aria-checked={kind === k.id}
              onClick={() => setKind(k.id)}
              className={`rounded-xl px-2 py-2.5 text-xs font-semibold transition-colors duration-200 ${kind === k.id ? 'bg-teal-100 text-teal-900 ring-2 ring-teal-500 dark:bg-teal-900/60 dark:text-teal-100' : 'bg-surface-3 text-ink-soft hover:text-ink'}`}
            >
              {k.label}
            </button>
          ))}
        </div>
        {kind === 'percent' && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Porcentaje" inputMode="numeric" placeholder="10" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, '').slice(0, 3))} data-testid="coupon-value" />
            <Field label="Tope (S/, opcional)" inputMode="decimal" placeholder="10.00" value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} />
          </div>
        )}
        {kind === 'amount' && <Field label="Descuento (S/)" inputMode="decimal" placeholder="5.00" value={value} onChange={(e) => setValue(e.target.value)} data-testid="coupon-value" />}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Compra mínima (S/)" inputMode="decimal" placeholder="0.00" value={minSubtotal} onChange={(e) => setMinSubtotal(e.target.value)} />
          <Field label="Usos por persona" inputMode="numeric" value={perUser} onChange={(e) => setPerUser(e.target.value.replace(/\D/g, '').slice(0, 3))} />
          <Field label="Límite total (opcional)" inputMode="numeric" placeholder="Sin límite" value={maxUses} onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, '').slice(0, 7))} />
          <Field label="Vence (opcional)" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </div>
        <Toggle checked={firstOrderOnly} onChange={setFirstOrderOnly} label="Solo primer pedido" description="Para personas que todavía no compraron." />
        {error && <p role="alert" className="text-sm font-semibold text-rose-700 dark:text-rose-400">{error}</p>}
      </div>
    </Modal>
  );
}
