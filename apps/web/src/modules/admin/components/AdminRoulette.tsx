import type { AdminRoulette, CampaignKind, CustomerSegment, PrizeKind, RouletteCampaignInput, RoulettePrize, SegmentInfo } from '@parla/types';
import { ArrowLeft, Copy, Dices, Eraser, Eye, Gift, Pencil, Play, Plus, Save, Trash2, Users, Zap, type LucideIcon } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { toast } from '@shared/stores/toast.store';
import { Button } from '@shared/ui/Button';
import { ErrorState, ListSkeleton } from '@shared/ui/States';
import { Toggle } from '@shared/ui/Toggle';
import { errorMessage, http } from '@shared/utils/http';
import { formatSoles } from '@shared/utils/money';
import { RouletteWheel } from '../../growth/components/RouletteWheel';
import { landingRotation } from '../../growth/utils/roulette.utils';
import { blankPrize, kindInfo, KINDS, PRIZE_KINDS, SEGMENT_HINT, TEMPLATES } from '../const/roulette.const';
import { useAdminData } from '../hooks/use-admin.hook';
import { RoulettePreview } from './RoulettePreview';

interface RoulettesData {
  roulettes: AdminRoulette[];
  segments: SegmentInfo[];
}

const KIND_ICON: Record<CampaignKind, LucideIcon> = { roulette: Dices, scratch: Eraser, box: Gift, flash: Zap };

/** ISO <-> valor de un <input type="datetime-local"> (hora local de quien edita). */
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);
const shortDate = (iso: string) => new Date(iso).toLocaleString('es-PE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const input = 'h-10 w-full min-w-0 rounded-lg bg-surface-3 px-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-teal-500/40';

function Label({ text, hint, children, className = '' }: { text: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 text-sm ${className}`}>
      <span className="font-medium text-ink-soft">{text}</span>
      {children}
      {hint && <span className="text-xs text-ink-faint">{hint}</span>}
    </label>
  );
}

const segmentName = (segments: SegmentInfo[], id: CustomerSegment) => segments.find((s) => s.id === id)?.label ?? id;

/** Ruletas de descuentos: a qué clientes les sale, qué premios tiene, cuánto cuesta y cómo le va. */
export function AdminRoulettes() {
  const { data, error, reload } = useAdminData<RoulettesData>('/admin/roulettes');
  const [editing, setEditing] = useState<{ id?: string; value: RouletteCampaignInput } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<AdminRoulette | null>(null);

  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <ListSkeleton rows={3} />;

  if (editing) {
    return (
      <Editor
        key={editing.id ?? 'new'}
        initial={editing.value}
        id={editing.id}
        segments={data.segments}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />
    );
  }

  const toggle = async (r: AdminRoulette, enabled: boolean) => {
    setBusy(r.id);
    try {
      await http.post(`/admin/roulettes/${r.id}/enabled`, { enabled });
      toast(enabled ? 'Ruleta encendida: ya les sale a sus clientes' : 'Ruleta apagada', 'success');
      reload();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {preview && <RoulettePreview roulette={preview} onClose={() => setPreview(null)} />}
      <section className="flex flex-col gap-3" aria-label="Tipos de clientes">
        <div>
          <h3 className="flex items-center gap-2 font-bold text-ink">
            <Users className="size-5 text-brand dark:text-teal-300" /> A quién le puedes llegar
          </h3>
          <p className="text-xs text-ink-faint">Cada cliente cae en un solo grupo (el más específico), así que nadie recibe dos ruletas distintas a la vez.</p>
        </div>
        <ul className="grid grid-cols-2 gap-2 lg:grid-cols-3 2xl:grid-cols-6">
          {data.segments.map((s) => (
            <li key={s.id} className="flex flex-col gap-1 rounded-2xl bg-surface p-3 shadow-float" title={s.rule}>
              <span className={`w-fit rounded-full px-2 py-0.5 text-[11px] font-bold ${SEGMENT_HINT[s.id].tone}`}>{s.label}</span>
              <span className="text-2xl font-extrabold text-ink">{s.audience}</span>
              <span className="text-[11px] leading-snug text-ink-soft">{s.rule}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3" aria-label="Ruletas">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-bold text-ink">
            <Dices className="size-5 text-brand dark:text-teal-300" /> Mis campañas
          </h3>
        </div>

        {data.roulettes.length === 0 ? (
          <div className="rounded-2xl bg-surface p-4 shadow-float md:p-5" data-testid="roulette-empty">
            <p className="font-bold text-ink">Todavía no tienes campañas</p>
            <p className="mb-3 text-sm text-ink-soft">Elige una estrategia (ruleta, rasca y gana, cofre sorpresa u oferta relámpago): cada plantilla ya trae premios y probabilidades pensados para ese tipo de cliente. Sale apagada para que la revises antes de encenderla.</p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 2xl:grid-cols-2" data-testid="roulettes">
            {data.roulettes.map((r) => (
              <li key={r.id}>
                <RouletteCard
                  roulette={r}
                  segments={data.segments}
                  busy={busy === r.id}
                  onToggle={(on) => void toggle(r, on)}
                  onPreview={() => setPreview(r)}
                  onEdit={() => setEditing({ id: r.id, value: { kind: r.kind, startsAt: r.startsAt, endsAt: r.endsAt, name: r.name, title: r.title, subtitle: r.subtitle, segment: r.segment, cooldownDays: r.cooldownDays, testMode: r.testMode, prizes: r.prizes } })}
                />
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-2xl border border-dashed border-line p-3 md:p-4">
          <p className="mb-2 text-sm font-bold text-ink">Crear una campaña</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setEditing({ value: t.build() })}
                className="flex flex-col items-start gap-0.5 rounded-xl bg-surface p-3 text-left shadow-float transition-colors hover:bg-teal-50 dark:hover:bg-teal-950/40"
                data-testid={`template-${t.id}`}
              >
                <span className="flex items-center gap-1.5 text-sm font-bold text-ink">
                  <KindIcon kind={t.kind} className="size-4 text-brand" /> {t.name}
                </span>
                <span className="text-xs text-ink-soft">{t.hint}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function KindIcon({ kind, className }: { kind: CampaignKind; className?: string }) {
  const Icon = KIND_ICON[kind];
  return <Icon className={className} />;
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-surface-3 px-3 py-2">
      <dt className="text-[11px] text-ink-faint">{label}</dt>
      <dd className="text-lg font-extrabold text-ink">{value}</dd>
    </div>
  );
}

function RouletteCard({ roulette: r, segments, busy, onToggle, onEdit, onPreview }: { roulette: AdminRoulette; segments: SegmentInfo[]; busy: boolean; onToggle: (on: boolean) => void; onEdit: () => void; onPreview: () => void }) {
  const rate = r.spins ? Math.round((r.redeemed / r.winners || 0) * 100) : 0;
  return (
    <article className={`flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-float md:p-5 ${r.enabled ? '' : 'opacity-90'}`} data-testid="roulette-card" data-enabled={r.enabled}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-bold text-ink">{r.name}</p>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
            <span className="inline-flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 font-bold text-surface">
              <KindIcon kind={r.kind} className="size-3" />
              {kindInfo(r.kind).label}
            </span>
            <span className={`rounded-full px-2 py-0.5 font-bold ${SEGMENT_HINT[r.segment].tone}`}>{segmentName(segments, r.segment)}</span>
            {r.testMode && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">Modo de prueba</span>}
            <span>llega a {r.audience} {r.audience === 1 ? 'persona' : 'personas'}</span>
            <span>· cada {r.cooldownDays} {r.cooldownDays === 1 ? 'día' : 'días'}</span>
            {r.endsAt && <span>· termina {shortDate(r.endsAt)}</span>}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${r.enabled ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200' : 'bg-surface-3 text-ink-soft'}`}>{r.enabled ? 'Encendida' : 'Apagada'}</span>
      </header>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Jugadas" value={r.spins} />
        <Kpi label="Ganaron cupón" value={r.winners} />
        <Kpi label="Lo usaron" value={`${r.redeemed}${r.winners ? ` (${rate} %)` : ''}`} />
        <Kpi label="Descontado" value={formatSoles(r.discountCents)} />
      </dl>
      <p className="text-xs text-ink-faint">Cada giro cuesta en promedio {r.expectedCostPercent} % de una compra de S/ 50 (si todos los cupones se usaran).</p>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <div className="min-w-48">
          <Toggle checked={r.enabled} onChange={onToggle} disabled={busy} label={r.enabled ? 'Se muestra al abrir la app' : 'No se muestra'} />
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" icon={<Eye className="size-4" />} onClick={onPreview} data-testid="preview-roulette">
            Ver cómo queda
          </Button>
          <Button variant="secondary" size="sm" icon={<Pencil className="size-4" />} onClick={onEdit} data-testid="edit-roulette">
            Editar
          </Button>
        </div>
      </div>
    </article>
  );
}

function prizeSummary(p: RoulettePrize): string {
  if (p.kind === 'none') return 'No gana nada';
  const what = p.kind === 'free_delivery' ? 'Envío gratis' : p.kind === 'amount' ? `${formatSoles(p.value)} de descuento` : `${p.value} % en productos${p.maxDiscountCents ? ` (hasta ${formatSoles(p.maxDiscountCents)})` : ''}`;
  return `${what}${p.minSubtotalCents ? ` · compra desde ${formatSoles(p.minSubtotalCents)}` : ''} · dura ${p.validDays} ${p.validDays === 1 ? 'día' : 'días'}`;
}

function Editor({ initial, id, segments, onClose, onSaved }: { initial: RouletteCampaignInput; id?: string; segments: SegmentInfo[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<RouletteCampaignInput>(initial);
  const [saving, setSaving] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [testing, setTesting] = useState(false);
  const [landed, setLanded] = useState<number | null>(null);
  const [fullPreview, setFullPreview] = useState(false);
  const total = useMemo(() => form.prizes.reduce((sum, p) => sum + (p.weight || 0), 0), [form.prizes]);
  const set = <K extends keyof RouletteCampaignInput>(key: K, value: RouletteCampaignInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setPrize = (i: number, patch: Partial<RoulettePrize>) => setForm((f) => ({ ...f, prizes: f.prizes.map((p, n) => (n === i ? { ...p, ...patch } : p)) }));
  const pct = (w: number) => (total ? Math.round((w / total) * 1000) / 10 : 0);

  const kind = kindInfo(form.kind);
  const isRoulette = form.kind === 'roulette';
  const isFlash = form.kind === 'flash';

  /** Cambia de estrategia y deja los premios dentro de lo que ella admite (la oferta relámpago lleva uno solo). */
  const changeCampaignKind = (next: CampaignKind) => {
    const info = kindInfo(next);
    setForm((f) => {
      let prizes = f.prizes;
      if (next === 'flash') prizes = [prizes.find((p) => p.kind !== 'none') ?? blankPrize({ weight: 1 })];
      else while (prizes.length < info.min) prizes = [...prizes, blankPrize({ weight: 10 })];
      return { ...f, kind: next, prizes: prizes.slice(0, info.max), endsAt: next === 'flash' && !f.endsAt ? new Date(Date.now() + 48 * 3_600_000).toISOString() : f.endsAt };
    });
    setLanded(null);
  };

  const changeKind = (i: number, kind: PrizeKind) => {
    const base: Partial<RoulettePrize> =
      kind === 'none' ? { kind, value: 0, label: 'Sigue intentando', maxDiscountCents: null, minSubtotalCents: 0 } : kind === 'free_delivery' ? { kind, value: 0, label: 'Envío gratis', maxDiscountCents: null } : kind === 'amount' ? { kind, value: 500, label: 'S/ 5 OFF', maxDiscountCents: null } : { kind, value: 10, label: '10 % OFF' };
    setPrize(i, base);
  };

  /** Prueba la rueda en esta pantalla: no guarda nada ni crea cupones. */
  const test = () => {
    if (testing || form.prizes.length < 2) return;
    let roll = Math.random() * total;
    let index = form.prizes.length - 1;
    for (const [i, p] of form.prizes.entries()) {
      if (roll < p.weight) {
        index = i;
        break;
      }
      roll -= p.weight;
    }
    setLanded(null);
    setTesting(true);
    setRotation((r) => landingRotation(r, index, form.prizes.length, 5, (Math.random() - 0.5) * 0.6));
    window.setTimeout(() => {
      setLanded(index);
      setTesting(false);
    }, 5300);
  };

  const save = async () => {
    setSaving(true);
    try {
      const body = { ...form, prizes: form.prizes.map((p) => ({ ...p, maxDiscountCents: p.maxDiscountCents ?? null })) };
      if (id) await http.put(`/admin/roulettes/${id}`, body);
      else await http.post('/admin/roulettes', body);
      toast(id ? 'Ruleta guardada' : 'Ruleta creada (está apagada: enciéndela cuando la revises)', 'success');
      onSaved();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const segment = segments.find((s) => s.id === form.segment);

  return (
    <div className="flex flex-col gap-4" data-testid="roulette-editor">
      {fullPreview && <RoulettePreview roulette={form} onClose={() => setFullPreview(false)} />}
      <div className="flex items-center gap-2">
        <button type="button" onClick={onClose} aria-label="Volver a las ruletas" className="flex size-10 items-center justify-center rounded-full text-ink-soft hover:bg-surface-3 hover:text-ink">
          <ArrowLeft className="size-5" />
        </button>
        <h3 className="text-lg font-extrabold text-ink">{id ? 'Editar campaña' : 'Nueva campaña'}</h3>
      </div>

      <section className="flex flex-col gap-2 rounded-2xl bg-surface p-4 shadow-float md:p-5" aria-label="Estrategia">
        <p className="text-sm font-bold text-ink">Estrategia</p>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" role="radiogroup" aria-label="Estrategia de la campaña">
          {KINDS.map((k) => {
            const on = form.kind === k.id;
            return (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => changeCampaignKind(k.id)}
                data-testid={`kind-${k.id}`}
                className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors ${on ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/60' : 'border-line hover:border-teal-300'}`}
              >
                <span className="flex items-center gap-1.5 text-sm font-bold text-ink">
                  <KindIcon kind={k.id} className="size-4 text-brand dark:text-teal-300" /> {k.label}
                </span>
                <span className="text-xs text-ink-soft">{k.hint}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4">
          <aside className="flex flex-col items-center gap-4 rounded-2xl bg-surface p-4 shadow-float sm:flex-row sm:items-center md:p-5">
            {isRoulette ? (
              <div className="w-full max-w-[13rem] shrink-0 px-2 pt-4">
                <RouletteWheel prizes={form.prizes.map((p) => ({ id: p.id, label: p.label, kind: p.kind }))} rotation={rotation} spinMs={5200} spinning={testing} winnerIndex={landed} />
              </div>
            ) : (
              <div className="flex size-40 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br from-teal-600 to-emerald-900 text-white shadow-float">
                <KindIcon kind={form.kind} className="size-16" />
              </div>
            )}
            <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center sm:items-start sm:text-left">
              <p className="text-sm font-bold text-ink">Vista previa</p>
              <p className="text-xs text-ink-soft">{isRoulette ? 'Así la ve el cliente. La rueda se arma sola con los premios de abajo.' : `${kind.label}: ${kind.hint} Míralo a pantalla completa para probarlo.`}</p>
              <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                {isRoulette && (
                  <Button variant="secondary" icon={<Play className="size-4" />} onClick={test} disabled={testing} data-testid="test-spin">
                    {testing ? 'Girando…' : 'Probar un giro'}
                  </Button>
                )}
                <Button variant="secondary" icon={<Eye className="size-4" />} onClick={() => setFullPreview(true)} data-testid="preview-full">
                  Ver a pantalla completa
                </Button>
              </div>
              <p className="text-xs text-ink-faint">{isRoulette && landed !== null ? `Salió: ${form.prizes[landed]?.label}` : 'La prueba no guarda nada ni crea cupones.'}</p>
            </div>
          </aside>

          <section className="grid grid-cols-1 gap-3 rounded-2xl bg-surface p-4 shadow-float sm:grid-cols-2 md:p-5">
            <Label text="Nombre (solo lo ves tú)">
              <input className={input} value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={80} data-testid="roulette-name" />
            </Label>
            <Label text="¿A qué clientes les sale?" hint={segment ? `${segment.rule} · hoy ${segment.audience} ${segment.audience === 1 ? 'persona' : 'personas'}` : undefined}>
              <select className={input} value={form.segment} onChange={(e) => set('segment', e.target.value as CustomerSegment)} data-testid="roulette-segment">
                {segments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} ({s.audience})
                  </option>
                ))}
              </select>
            </Label>
            <Label text="Titular que ve el cliente">
              <input className={input} value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={40} data-testid="roulette-title" />
            </Label>
            <Label text="Puede volver a jugar cada" hint="Mientras tanto no se le muestra.">
              <span className="flex items-center rounded-lg bg-surface-3 focus-within:ring-2 focus-within:ring-teal-500/40">
                <input type="number" min={1} max={365} className="h-10 w-full min-w-0 bg-transparent px-2.5 text-sm text-ink outline-none" value={form.cooldownDays} onChange={(e) => set('cooldownDays', Number(e.target.value))} />
                <span className="pr-3 text-xs text-ink-faint">días</span>
              </span>
            </Label>
            <div className="sm:col-span-2">
              <Toggle checked={form.testMode} onChange={(v) => set('testMode', v)} label="Modo de prueba" description="Aparece en cada visita y recarga, y los giros no gastan el turno. Apágalo antes de lanzarla a tus clientes." />
            </div>
            <Label text="Empieza (opcional)" hint="Antes de esa hora no se muestra.">
              <input type="datetime-local" className={input} value={toLocalInput(form.startsAt)} onChange={(e) => set('startsAt', fromLocalInput(e.target.value))} data-testid="campaign-starts" />
            </Label>
            <Label text={isFlash ? 'Termina (obligatorio)' : 'Termina (opcional)'} hint={isFlash ? 'Es la cuenta regresiva que ve el cliente.' : 'Después de esa hora ya no se muestra.'}>
              <input type="datetime-local" className={input} value={toLocalInput(form.endsAt)} onChange={(e) => set('endsAt', fromLocalInput(e.target.value))} data-testid="campaign-ends" />
            </Label>
            <Label text="Subtítulo" className="sm:col-span-2">
              <input className={input} value={form.subtitle} onChange={(e) => set('subtitle', e.target.value)} maxLength={100} />
            </Label>
          </section>

          <section className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-float md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="font-bold text-ink">{isFlash ? 'Cupón de la oferta' : isRoulette ? `Premios de la rueda (${form.prizes.length})` : `Premios posibles (${form.prizes.length})`}</h4>
                <p className="text-xs text-ink-faint">{isFlash ? 'Todos los que reclaman reciben este cupón.' : `De ${kind.min} a ${kind.max}. El peso decide la probabilidad: más peso, sale más seguido.`}</p>
              </div>
              {!isFlash && <Button variant="secondary" size="sm" icon={<Plus className="size-4" />} disabled={form.prizes.length >= kind.max} onClick={() => setForm((f) => ({ ...f, prizes: [...f.prizes, blankPrize({ weight: 10 })] }))} data-testid="add-prize">
                Agregar premio
              </Button>}
            </div>

            <ul className="flex flex-col gap-2">
              {form.prizes.map((p, i) => (
                <li key={p.id} className="grid grid-cols-2 items-end gap-2 rounded-xl border border-line p-3 md:grid-cols-6" data-testid="prize-row">
                  <Label text="Texto en la rueda" className="col-span-2 md:col-span-2">
                    <input className={input} value={p.label} maxLength={24} onChange={(e) => setPrize(i, { label: e.target.value })} aria-label={`Texto del premio ${i + 1}`} />
                  </Label>
                  <Label text="Tipo" className="col-span-2 md:col-span-2">
                    <select className={input} value={p.kind} onChange={(e) => changeKind(i, e.target.value as PrizeKind)} aria-label={`Tipo del premio ${i + 1}`}>
                      {PRIZE_KINDS.filter((k) => !isFlash || k.id !== 'none').map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </Label>
                  <Label text="Peso" className="md:col-span-1">
                    <input type="number" min={1} max={1000} className={input} value={p.weight} onChange={(e) => setPrize(i, { weight: Number(e.target.value) })} aria-label={`Peso del premio ${i + 1}`} />
                  </Label>
                  <div className="flex items-center justify-between gap-1 md:col-span-1">
                    <span className="rounded-full bg-teal-100 px-2 py-1 text-xs font-extrabold text-teal-800 dark:bg-teal-900/60 dark:text-teal-200" title="Probabilidad">
                      {pct(p.weight)} %
                    </span>
                    <button type="button" onClick={() => setForm((f) => ({ ...f, prizes: f.prizes.filter((_, n) => n !== i) }))} disabled={form.prizes.length <= kind.min} aria-label={`Quitar el premio ${i + 1}`} className="flex size-9 items-center justify-center rounded-full text-ink-soft hover:bg-rose-50 hover:text-rose-700 disabled:opacity-30 dark:hover:bg-rose-950/40">
                      <Trash2 className="size-4" />
                    </button>
                  </div>

                  {p.kind !== 'none' && (
                    <div className="col-span-2 grid grid-cols-2 gap-2 md:col-span-6 md:grid-cols-4">
                      {p.kind === 'percent' && (
                        <Label text="Descuento">
                          <span className="flex items-center rounded-lg bg-surface-3">
                            <input type="number" min={1} max={100} className="h-10 w-full min-w-0 bg-transparent px-2.5 text-sm text-ink outline-none" value={p.value} onChange={(e) => setPrize(i, { value: Number(e.target.value) })} aria-label={`Porcentaje del premio ${i + 1}`} />
                            <span className="pr-2.5 text-xs text-ink-faint">%</span>
                          </span>
                        </Label>
                      )}
                      {p.kind === 'percent' && (
                        <Label text="Tope (opcional)">
                          <span className="flex items-center rounded-lg bg-surface-3">
                            <input type="number" min={0} step="0.5" className="h-10 w-full min-w-0 bg-transparent px-2.5 text-sm text-ink outline-none" value={p.maxDiscountCents ? p.maxDiscountCents / 100 : ''} placeholder="sin tope" onChange={(e) => setPrize(i, { maxDiscountCents: e.target.value ? Math.round(Number(e.target.value) * 100) : null })} aria-label={`Tope del premio ${i + 1}`} />
                            <span className="pr-2.5 text-xs text-ink-faint">S/</span>
                          </span>
                        </Label>
                      )}
                      {p.kind === 'amount' && (
                        <Label text="Descuento">
                          <span className="flex items-center rounded-lg bg-surface-3">
                            <input type="number" min={0.5} step="0.5" className="h-10 w-full min-w-0 bg-transparent px-2.5 text-sm text-ink outline-none" value={p.value / 100} onChange={(e) => setPrize(i, { value: Math.round(Number(e.target.value) * 100) })} aria-label={`Monto del premio ${i + 1}`} />
                            <span className="pr-2.5 text-xs text-ink-faint">S/</span>
                          </span>
                        </Label>
                      )}
                      <Label text="Compra mínima">
                        <span className="flex items-center rounded-lg bg-surface-3">
                          <input type="number" min={0} step="1" className="h-10 w-full min-w-0 bg-transparent px-2.5 text-sm text-ink outline-none" value={p.minSubtotalCents / 100} onChange={(e) => setPrize(i, { minSubtotalCents: Math.round(Number(e.target.value) * 100) })} aria-label={`Compra mínima del premio ${i + 1}`} />
                          <span className="pr-2.5 text-xs text-ink-faint">S/</span>
                        </span>
                      </Label>
                      <Label text="El cupón dura">
                        <span className="flex items-center rounded-lg bg-surface-3">
                          <input type="number" min={1} max={90} className="h-10 w-full min-w-0 bg-transparent px-2.5 text-sm text-ink outline-none" value={p.validDays} onChange={(e) => setPrize(i, { validDays: Number(e.target.value) })} aria-label={`Vigencia del premio ${i + 1}`} />
                          <span className="pr-2.5 text-xs text-ink-faint">días</span>
                        </span>
                      </Label>
                    </div>
                  )}
                  <p className="col-span-2 text-xs text-ink-faint md:col-span-6">{prizeSummary(p)}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>

      </div>

      <div className="sticky bottom-0 -mx-3 flex flex-wrap items-center justify-between gap-2 border-t border-line bg-canvas/95 px-3 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:bg-surface sm:px-4">
        <p className="flex items-center gap-1.5 text-xs text-ink-soft">
          <Copy className="size-3.5" /> Peso total {total} · {form.prizes.filter((p) => p.kind !== 'none').reduce((s, p) => s + p.weight, 0) && total ? `${pct(form.prizes.filter((p) => p.kind !== 'none').reduce((s, p) => s + p.weight, 0))} % de los giros ganan algo` : 'ningún giro gana'}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button icon={<Save className="size-4" />} onClick={() => void save()} loading={saving} data-testid="save-roulette">
            Guardar
          </Button>
        </div>
      </div>
    </div>
  );
}
