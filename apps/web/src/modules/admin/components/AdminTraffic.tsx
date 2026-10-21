import type { AdminTraffic as Traffic, PersonRole, TrafficDay } from '@parla/types';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Avatar } from '@shared/ui/Avatar';
import { ErrorState, ListSkeleton } from '@shared/ui/States';
import { useAdminData } from '../hooks/use-admin.hook';

const RANGES = [7, 30, 90] as const;
const ROLE_LABEL: Record<PersonRole, string> = { client: 'Cliente', driver: 'Repartidor', business: 'Negocio', admin: 'Soporte' };

const dayLabel = (day: string, long = false) =>
  new Intl.DateTimeFormat('es-PE', long ? { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' } : { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));

/** Escala «redonda» para el eje: 1, 2, 5 × 10ⁿ. */
function niceMax(value: number): number {
  if (value <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((s) => s * pow >= value / 4)! * pow;
  return Math.ceil(value / step) * step;
}

const H = 200;
const PAD = { top: 12, right: 12, bottom: 24, left: 34 };
const plotH = H - PAD.top - PAD.bottom;

/** Ancho real del gráfico en píxeles: el SVG se dibuja 1:1 y el texto queda legible en el celular. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

function Axis({ max, days, W }: { max: number; days: TrafficDay[]; W: number }) {
  const plotW = W - PAD.left - PAD.right;
  const ticks = [0, max / 2, max];
  const every = Math.ceil(days.length / Math.max(2, Math.floor(plotW / 70)));
  const x = (i: number) => PAD.left + ((i + 0.5) / days.length) * plotW;
  return (
    <g className="text-[11px]" fill="var(--ink-faint)">
      {ticks.map((t) => {
        const y = PAD.top + plotH - (t / max) * plotH;
        return (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="var(--line)" strokeWidth={1} />
            <text x={PAD.left - 6} y={y + 3} textAnchor="end">
              {Math.round(t)}
            </text>
          </g>
        );
      })}
      {days.map((d, i) =>
        i % every === 0 || i === days.length - 1 ? (
          <text key={d.day} x={x(i)} y={H - 6} textAnchor="middle">
            {dayLabel(d.day)}
          </text>
        ) : null,
      )}
    </g>
  );
}

function Tooltip({ day, x, W, children }: { day: TrafficDay; x: number; W: number; children: ReactNode }) {
  const left = `${Math.min(Math.max((x / W) * 100, 12), 88)}%`;
  return (
    <div role="status" className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-lg bg-surface px-3 py-2 text-xs shadow-pop" style={{ left }}>
      <p className="mb-1 font-semibold text-ink capitalize">{dayLabel(day.day, true)}</p>
      {children}
    </div>
  );
}

function Swatch({ color, line = false }: { color: string; line?: boolean }) {
  return <span aria-hidden className={line ? 'inline-block h-0.5 w-3 rounded' : 'inline-block size-2.5 rounded-sm'} style={{ background: color }} />;
}

/** Visitas por día (una serie: el título la nombra). Pasar el cursor muestra el detalle del día. */
function VisitsChart({ days }: { days: TrafficDay[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const { ref, width: W } = useWidth();
  const plotW = W - PAD.left - PAD.right;
  const max = niceMax(Math.max(...days.map((d) => d.visits)));
  const slot = plotW / days.length;
  const barW = Math.max(2, Math.min(24, slot - 2));
  return (
    <div className="relative" ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label="Visitas por día" onMouseLeave={() => setHover(null)}>
        <Axis max={max} days={days} W={W} />
        {days.map((d, i) => {
          const h = (d.visits / max) * plotH;
          const x = PAD.left + i * slot + (slot - barW) / 2;
          const y = PAD.top + plotH - h;
          const r = Math.min(4, barW / 2, h);
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${dayLabel(d.day, true)}: ${d.visits} visitas`}>
              <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={plotH} fill="transparent" />
              {h > 0 && <path d={`M${x},${PAD.top + plotH} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${PAD.top + plotH} Z`} fill="var(--chart-1)" opacity={hover === null || hover === i ? 1 : 0.45} />}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <Tooltip day={days[hover]} x={PAD.left + (hover + 0.5) * slot} W={W}>
          <p className="text-ink">
            <b className="tabular-nums">{days[hover].visits}</b> visitas
          </p>
          <p className="text-ink-soft">
            <b className="tabular-nums">{days[hover].uniqueUsers}</b> personas distintas
          </p>
        </Tooltip>
      )}
    </div>
  );
}

const SERIES = [
  { key: 'signups' as const, label: 'Altas', color: 'var(--chart-1)' },
  { key: 'orders' as const, label: 'Pedidos', color: 'var(--chart-2)' },
];

/** Altas y pedidos por día: dos líneas en la misma escala (son conteos), con leyenda y etiquetas al final. */
function GrowthChart({ days }: { days: TrafficDay[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const { ref, width } = useWidth();
  // Espacio a la derecha para las etiquetas de cada línea.
  const W = width - 56;
  const plotW = W - PAD.left - PAD.right;
  const max = niceMax(Math.max(...days.flatMap((d) => [d.signups, d.orders])));
  const x = (i: number) => PAD.left + ((i + 0.5) / days.length) * plotW;
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  return (
    <div className="relative" ref={ref}>
      <div className="mb-1 flex gap-4 text-xs text-ink-soft" aria-hidden>
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <Swatch color={s.color} line /> {s.label}
          </span>
        ))}
      </div>
      <svg
        width={width}
        height={H}
        viewBox={`0 0 ${width} ${H}`}
        className="block"
        role="img"
        aria-label="Altas y pedidos por día"
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const px = e.clientX - box.left;
          const i = Math.round(((px - PAD.left) / plotW) * days.length - 0.5);
          setHover(i >= 0 && i < days.length ? i : null);
        }}
        onMouseLeave={() => setHover(null)}
      >
        <Axis max={max} days={days} W={W} />
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--ink-faint)" strokeDasharray="3 3" />}
        {SERIES.map((s, si) => {
          const last = days[days.length - 1];
          // Si las dos líneas terminan juntas, las etiquetas se separan para no encimarse.
          const ys = SERIES.map((t) => y(last[t.key]) + 4);
          const apart = Math.abs(ys[0] - ys[1]) < 13;
          const labelY = apart ? (ys[0] + ys[1]) / 2 + (si === 0 ? -7 : 7) : ys[si];
          return (
            <g key={s.key}>
              <polyline points={days.map((d, i) => `${x(i)},${y(d[s.key])}`).join(' ')} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {hover !== null && <circle cx={x(hover)} cy={y(days[hover][s.key])} r={4.5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />}
              <text x={x(days.length - 1) + 8} y={labelY} className="text-[11px]" fill="var(--ink-soft)">
                {s.label}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <Tooltip day={days[hover]} x={x(hover)} W={width}>
          {SERIES.map((s) => (
            <p key={s.key} className="flex items-center gap-1.5 text-ink">
              <Swatch color={s.color} /> {s.label}: <b className="tabular-nums">{days[hover][s.key]}</b>
            </p>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-2xl bg-surface p-4 shadow-float">
      <p className="text-xs font-semibold text-ink-soft">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold text-ink tabular-nums">{value.toLocaleString('es-PE')}</p>
      {hint && <p className="text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-surface p-4 shadow-float md:p-5">
      <h3 className="mb-2 font-bold text-ink">{title}</h3>
      {children}
    </section>
  );
}

/** Soporte: cuánta gente entra a Parla, cuántos se registran y piden, y quiénes la usan más. */
export function AdminTraffic() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [table, setTable] = useState(false);
  const data = useAdminData<Traffic>(`/admin/traffic?days=${days}`);
  const t = data.data;

  return (
    <div className="flex flex-col gap-4" data-testid="admin-traffic">
      <div className="flex flex-wrap items-center gap-1.5">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={days === r}
            onClick={() => setDays(r)}
            className={`h-8 rounded-full px-3 text-xs font-semibold ${days === r ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200' : 'bg-surface text-ink-soft shadow-float'}`}
          >
            {r} días
          </button>
        ))}
        <button type="button" onClick={() => setTable(!table)} className="ml-auto h-8 rounded-full px-3 text-xs font-semibold text-ink-soft hover:text-ink">
          {table ? 'Ver gráficos' : 'Ver tabla'}
        </button>
      </div>

      {data.error && !t ? (
        <ErrorState message={data.error} onRetry={data.reload} />
      ) : !t ? (
        <ListSkeleton rows={4} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="En línea ahora" value={t.totals.onlineNow} hint={`${t.totals.activeToday} entraron hoy`} />
            <Tile label={`Visitas (${days} días)`} value={t.totals.visits} />
            <Tile label="Personas registradas" value={t.totals.users} hint={`+${t.totals.signups} en ${days} días`} />
            <Tile label={`Pedidos (${days} días)`} value={t.totals.orders} />
            <Tile label="Clientes" value={t.totals.clients} />
            <Tile label="Repartidores" value={t.totals.drivers} hint={`${t.totals.driversOnline} conectados`} />
            <Tile label="Negocios" value={t.totals.businesses} />
            <Tile label="Suspendidos" value={t.totals.blocked} />
          </div>

          {table ? (
            <section className="overflow-x-auto rounded-2xl bg-surface p-4 shadow-float">
              <table className="w-full min-w-[420px] text-sm" data-testid="traffic-table">
                <thead>
                  <tr className="text-left text-xs text-ink-faint">
                    <th className="py-1">Día</th>
                    <th className="py-1 text-right">Visitas</th>
                    <th className="py-1 text-right">Personas</th>
                    <th className="py-1 text-right">Altas</th>
                    <th className="py-1 text-right">Pedidos</th>
                  </tr>
                </thead>
                <tbody>
                  {[...t.days].reverse().map((d) => (
                    <tr key={d.day} className="border-t border-line tabular-nums">
                      <td className="py-1.5 text-ink capitalize">{dayLabel(d.day, true)}</td>
                      <td className="py-1.5 text-right text-ink">{d.visits}</td>
                      <td className="py-1.5 text-right text-ink">{d.uniqueUsers}</td>
                      <td className="py-1.5 text-right text-ink">{d.signups}</td>
                      <td className="py-1.5 text-right text-ink">{d.orders}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : (
            <>
              <ChartCard title="Visitas por día">
                <VisitsChart days={t.days} />
              </ChartCard>
              <ChartCard title="Altas y pedidos por día">
                <GrowthChart days={t.days} />
              </ChartCard>
            </>
          )}

          <ChartCard title={`Quiénes entran más (${days} días)`}>
            {t.topUsers.length === 0 ? (
              <p className="text-sm text-ink-soft">Aún no hay visitas registradas en este período.</p>
            ) : (
              <ol className="flex flex-col gap-2" data-testid="traffic-top">
                {t.topUsers.map((u, i) => (
                  <li key={u.id} className="flex items-center gap-3">
                    <span className="w-5 text-right text-sm font-bold text-ink-faint tabular-nums">{i + 1}</span>
                    <Avatar name={u.displayName} color={u.avatarColor} photo={u.avatarUrl} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">{u.displayName}</span>
                      <span className="block text-xs text-ink-faint">{u.roles.map((r) => ROLE_LABEL[r]).join(' · ')}</span>
                    </span>
                    <span className="text-right text-sm text-ink tabular-nums">
                      <b>{u.visits}</b> visitas
                      <span className="block text-xs text-ink-faint">{u.activeDays} días activo</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </ChartCard>
        </>
      )}
    </div>
  );
}
