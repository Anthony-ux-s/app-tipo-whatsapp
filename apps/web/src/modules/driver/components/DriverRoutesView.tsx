import type { DriverRouteEntry, DriverRoutePlan, DriverRoutesSummary, GeoPoint } from '@parla/types';
import { Fuel, Navigation, Route, Wallet } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { LazyRouteMap } from '@shared/ui/LazyDeliveryMap';
import type { RouteMapStop } from '@shared/ui/RouteMap';
import { EmptyState, ErrorState, ListSkeleton } from '@shared/ui/States';
import { EmptyChatsIllustration } from '@shared/ui/illustrations';
import { formatListTimestamp } from '@shared/utils/date';
import { errorMessage, http } from '@shared/utils/http';
import { formatSoles } from '@shared/utils/money';
import { fetchRoute } from '@shared/utils/routing';
import { PageHeader, ServicePage } from '../../services/components/ServicesUi';

const RANGES = [
  { days: 1, label: 'Hoy' },
  { days: 7, label: '7 días' },
  { days: 30, label: '30 días' },
  { days: 90, label: '90 días' },
] as const;

const km = (v: number) => `${v.toFixed(1)} km`;

/** Abre la navegación paso a paso con todas las paradas, en orden (Google Maps). */
function navigationUrl(start: GeoPoint | null, stops: GeoPoint[]): string {
  const fmt = (p: GeoPoint) => `${p.lat},${p.lng}`;
  const destination = stops[stops.length - 1];
  const params = new URLSearchParams({ api: '1', destination: fmt(destination), travelmode: 'driving' });
  if (start) params.set('origin', fmt(start));
  if (stops.length > 1) params.set('waypoints', stops.slice(0, -1).map(fmt).join('|'));
  return `https://www.google.com/maps/dir/?${params}`;
}

function Fact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-surface-3 p-3">
      <span className="text-brand dark:text-teal-300">{icon}</span>
      <span>
        <span className="block text-xs text-ink-faint">{label}</span>
        <span className="block font-bold text-ink tabular-nums">{value}</span>
      </span>
    </div>
  );
}

/** El orden óptimo para los pedidos en curso, dibujado por las calles. */
function CurrentPlan() {
  const [plan, setPlan] = useState<DriverRoutePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [path, setPath] = useState<GeoPoint[] | null>(null);

  const load = () => {
    setError(null);
    http
      .get<DriverRoutePlan>('/driver/route-plan')
      .then(setPlan)
      .catch((err) => setError(errorMessage(err)));
  };
  useEffect(load, []);
  // En vivo: la ubicación (y el orden de las paradas) se vuelve a pedir cada 3 s mientras hay pedidos.
  const live = !!plan?.stops.length;
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => {
      http
        .get<DriverRoutePlan>('/driver/route-plan')
        .then(setPlan)
        .catch(() => undefined);
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [live]);

  // La ruta por las calles se recalcula cuando cambian las paradas o el repartidor avanza unos 100 m.
  const routeKey = plan ? [...(plan.start ? [plan.start] : []), ...plan.stops.map((s) => s.point)].map((p) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`).join(';') : '';
  useEffect(() => {
    if (!plan?.stops.length) {
      setPath(null);
      return;
    }
    void fetchRoute([...(plan.start ? [plan.start] : []), ...plan.stops.map((s) => s.point)]).then((r) => r && setPath(r.path));
  }, [routeKey]);

  const stopsKey = plan?.stops.map((s) => `${s.orderId}-${s.kind}`).join('|') ?? '';
  const stops = useMemo<RouteMapStop[]>(() => plan?.stops.map((s, i) => ({ point: s.point, kind: s.kind, n: i + 1, title: s.label })) ?? [], [stopsKey]);
  const paths = useMemo(() => (path ? [path] : undefined), [path]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!plan) return <ListSkeleton rows={2} />;
  if (plan.stops.length === 0) {
    return <p className="rounded-2xl bg-surface p-4 text-sm text-ink-soft shadow-float">No tienes pedidos en curso. Cuando tomes uno (o varios), aquí verás el mejor orden para recoger y entregar.</p>;
  }
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-float md:p-5" data-testid="route-plan">
      <LazyRouteMap label="Ruta óptima de tus pedidos en curso" start={plan.start} vehicle={plan.vehicle} stops={stops} paths={paths} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Fact icon={<Route className="size-4" />} label="Recorrido" value={km(plan.totalKm)} />
        <Fact icon={<Navigation className="size-4" />} label="Tiempo" value={`${plan.etaMinutes} min`} />
        <Fact icon={<Fuel className="size-4" />} label="Combustible" value={formatSoles(plan.fuelCents)} />
        <Fact icon={<Route className="size-4" />} label="Te ahorras" value={km(plan.savedKm)} />
      </div>
      <ol className="flex flex-col gap-2">
        {plan.stops.map((s, i) => (
          <li key={`${s.orderId}-${s.kind}`} className="flex items-center gap-3 text-sm">
            <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${s.kind === 'pickup' ? 'bg-amber-600' : 'bg-brand'}`}>{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-ink">{s.label}</span>
            <span className="text-xs text-ink-faint tabular-nums">{km(s.legKm)}</span>
          </li>
        ))}
      </ol>
      <a
        href={navigationUrl(plan.start, plan.stops.map((s) => s.point))}
        target="_blank"
        rel="noreferrer"
        className="flex h-11 items-center justify-center gap-2 rounded-xl bg-brand font-semibold text-white transition-colors hover:bg-brand-strong"
      >
        <Navigation className="size-4" /> Navegar con todas las paradas
      </a>
    </section>
  );
}

/** Historial: todas las entregas del período en el mapa, lo ganado y el combustible. */
function History() {
  const [days, setDays] = useState<number>(7);
  const [data, setData] = useState<DriverRoutesSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DriverRouteEntry | null>(null);
  const [selectedPath, setSelectedPath] = useState<GeoPoint[] | null>(null);

  const load = () => {
    setError(null);
    setData(null);
    setSelected(null);
    http
      .get<DriverRoutesSummary>(`/driver/routes?days=${days}`)
      .then(setData)
      .catch((err) => setError(errorMessage(err)));
  };
  useEffect(load, [days]);

  useEffect(() => {
    setSelectedPath(null);
    if (selected?.pickup && selected.dropoff) void fetchRoute([selected.pickup, selected.dropoff]).then((r) => setSelectedPath(r?.path ?? null));
  }, [selected]);

  const shown = useMemo(() => (selected ? [selected] : (data?.routes ?? [])), [selected, data]);
  const stops = useMemo<RouteMapStop[]>(
    () => shown.flatMap((r) => [...(r.pickup ? [{ point: r.pickup, kind: 'pickup' as const, title: r.businessName }] : []), ...(r.dropoff ? [{ point: r.dropoff, kind: 'dropoff' as const, title: r.dropoffLine }] : [])]),
    [shown],
  );
  const paths = useMemo(
    () => (selectedPath ? [selectedPath] : shown.flatMap((r) => (r.pickup && r.dropoff ? [[r.pickup, r.dropoff]] : []))),
    [selectedPath, shown],
  );

  return (
    <section className="flex flex-col gap-3" data-testid="route-history">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {RANGES.map((r) => (
          <button
            key={r.days}
            type="button"
            aria-pressed={days === r.days}
            onClick={() => setDays(r.days)}
            className={`h-8 shrink-0 rounded-full px-3 text-xs font-semibold ${days === r.days ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200' : 'bg-surface text-ink-soft shadow-float'}`}
          >
            {r.label}
          </button>
        ))}
      </div>
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data ? (
        <ListSkeleton rows={3} />
      ) : data.routes.length === 0 ? (
        <EmptyState compact illustration={<EmptyChatsIllustration />} title="Sin entregas" description="No hiciste entregas en este período." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Fact icon={<Route className="size-4" />} label={`${data.routes.length} entregas`} value={km(data.totalKm)} />
            <Fact icon={<Wallet className="size-4" />} label="Ganaste" value={formatSoles(data.earningsCents)} />
            <Fact icon={<Fuel className="size-4" />} label={`Combustible (${data.vehicle})`} value={formatSoles(data.fuelCents)} />
            <Fact icon={<Wallet className="size-4" />} label="Te queda" value={formatSoles(data.earningsCents - data.fuelCents)} />
          </div>
          <div className="rounded-2xl bg-surface p-3 shadow-float">
            <LazyRouteMap label="Tus rutas de entrega" stops={stops} paths={paths} />
            {selected && (
              <button type="button" onClick={() => setSelected(null)} className="mt-2 text-sm font-semibold text-brand dark:text-teal-300">
                Ver todas las rutas
              </button>
            )}
          </div>
          <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-float">
            {data.routes.map((r) => (
              <li key={r.orderId}>
                <button
                  type="button"
                  onClick={() => setSelected(r)}
                  aria-pressed={selected?.orderId === r.orderId}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2 ${selected?.orderId === r.orderId ? 'bg-teal-50 dark:bg-teal-950/40' : ''}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {r.businessName} → {r.dropoffLine}
                    </span>
                    <span className="block text-xs text-ink-faint">
                      {formatListTimestamp(r.deliveredAt)} · {r.distanceKm === null ? 'sin ubicación' : km(r.distanceKm)} · combustible {formatSoles(r.fuelCents)}
                    </span>
                  </span>
                  <span className="font-bold text-ink tabular-nums">{formatSoles(r.earningsCents)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Rapidito: la ruta óptima de lo que llevo ahora y el historial de todas mis rutas. */
export function DriverRoutesView() {
  const navigate = useNavigate();
  return (
    <ServicePage>
      <PageHeader title="Mis rutas" subtitle="El mejor orden para tus pedidos y todo lo que recorriste" onBack={() => navigate('/app/rapidito')} />
      <h2 className="px-1 text-xs font-bold tracking-wider text-ink-faint uppercase">Ahora</h2>
      <CurrentPlan />
      <h2 className="px-1 pt-2 text-xs font-bold tracking-wider text-ink-faint uppercase">Historial</h2>
      <History />
    </ServicePage>
  );
}
