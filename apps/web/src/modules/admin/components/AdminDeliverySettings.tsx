import type { DeliveryPricing, DeliveryQuoteBreakdown, DeliverySettings, DriverVehicle, GeoPoint } from '@parla/types';
import { Fuel, MapPinned, Route, Save, Users } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from '@shared/stores/toast.store';
import { Button } from '@shared/ui/Button';
import { LazyRouteMap } from '@shared/ui/LazyDeliveryMap';
import { ErrorState, ListSkeleton } from '@shared/ui/States';
import { Toggle } from '@shared/ui/Toggle';
import { DEFAULT_CENTER } from '@shared/utils/geo';
import { errorMessage, http } from '@shared/utils/http';
import { formatLongDate, formatSoles } from '@shared/utils/money';

const VEHICLES: DriverVehicle[] = ['Moto', 'Auto', 'Bicicleta', 'A pie'];
const METHOD_LABEL = { streets: 'por las calles', straight_line: 'línea recta × factor de calles', flat: 'tarifa plana (sin ubicaciones)' };

/** Formulario en soles (texto) para los montos en céntimos. */
type Form = Omit<DeliveryPricing, 'baseFeeCents' | 'perKmCents' | 'minFeeCents' | 'maxFeeCents' | 'flatFeeCents' | 'fuelPriceCentsPerGallon'> & {
  base: string;
  perKm: string;
  min: string;
  max: string;
  flat: string;
  fuel: string;
};

const soles = (cents: number) => (cents / 100).toFixed(2);
const cents = (value: string) => Math.round(Number(value.replace(',', '.')) * 100);

function toForm(p: DeliveryPricing): Form {
  const { baseFeeCents, perKmCents, minFeeCents, maxFeeCents, flatFeeCents, fuelPriceCentsPerGallon, ...rest } = p;
  return { ...rest, base: soles(baseFeeCents), perKm: soles(perKmCents), min: soles(minFeeCents), max: soles(maxFeeCents), flat: soles(flatFeeCents), fuel: soles(fuelPriceCentsPerGallon) };
}

function toPricing(f: Form): DeliveryPricing {
  const { base, perKm, min, max, flat, fuel, ...rest } = f;
  return { ...rest, baseFeeCents: cents(base), perKmCents: cents(perKm), minFeeCents: cents(min), maxFeeCents: cents(max), flatFeeCents: cents(flat), fuelPriceCentsPerGallon: cents(fuel) };
}

function NumberInput({ label, value, onChange, suffix, step = '0.01' }: { label: string; value: string | number; onChange: (v: string) => void; suffix?: string; step?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-ink-soft">{label}</span>
      <span className="flex items-center rounded-[var(--radius-card)] bg-surface-3 focus-within:ring-2 focus-within:ring-teal-500/40">
        <input type="number" inputMode="decimal" step={step} min="0" value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full min-w-0 bg-transparent px-3 text-ink outline-none" />
        {suffix && <span className="pr-3 text-xs text-ink-faint">{suffix}</span>}
      </span>
    </label>
  );
}

function Card({ icon, title, children, footer }: { icon: ReactNode; title: string; children: ReactNode; footer?: string }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-float md:p-5">
      <h3 className="flex items-center gap-2 font-bold text-ink">
        <span className="text-brand dark:text-teal-300">{icon}</span>
        {title}
      </h3>
      {children}
      {footer && <p className="text-xs text-ink-faint">{footer}</p>}
    </section>
  );
}

/**
 * Soporte configura la tarifa del delivery (base, por km y combustible de cada vehículo) y la prueba
 * en el mapa antes de guardarla. Vale para las cotizaciones siguientes.
 */
export function AdminDeliverySettings() {
  const [saved, setSaved] = useState<DeliverySettings | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickup, setPickup] = useState<GeoPoint>(DEFAULT_CENTER);
  const [dropoff, setDropoff] = useState<GeoPoint>({ lat: DEFAULT_CENTER.lat - 0.022, lng: DEFAULT_CENTER.lng + 0.018 });
  const [marking, setMarking] = useState<'pickup' | 'dropoff'>('dropoff');
  const [quote, setQuote] = useState<DeliveryQuoteBreakdown | null>(null);

  const load = () => {
    setError(null);
    http
      .get<DeliverySettings>('/admin/delivery-settings')
      .then((s) => {
        setSaved(s);
        setForm(toForm(s));
      })
      .catch((err) => setError(errorMessage(err)));
  };
  useEffect(load, []);

  // Simulación con lo que se está editando (sin guardar), medio segundo después del último cambio.
  useEffect(() => {
    if (!form) return;
    const timer = window.setTimeout(() => {
      http
        .post<DeliveryQuoteBreakdown>('/admin/delivery-settings/simulate', { pickup, dropoff, pricing: toPricing(form) })
        .then(setQuote)
        .catch(() => setQuote(null));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [form, pickup, dropoff]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!form || !saved) return <ListSkeleton rows={4} />;
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm({ ...form, [key]: value });
  const setPerVehicle = (key: 'kmPerGallon' | 'avgSpeedKmh', v: DriverVehicle, value: string) => setForm({ ...form, [key]: { ...form[key], [v]: Number(value) } });

  const save = async () => {
    setSaving(true);
    try {
      const s = await http.put<DeliverySettings>('/admin/delivery-settings', toPricing(form));
      setSaved(s);
      setForm(toForm(s));
      toast('Tarifa guardada: vale para los próximos pedidos', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="admin-delivery-settings">
      <Card icon={<MapPinned className="size-5" />} title="Simulador" footer="Toca el mapa para mover el punto elegido. La prueba usa lo que estás editando, aunque no lo hayas guardado.">
        <div className="flex gap-2">
          {(['pickup', 'dropoff'] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={marking === k}
              onClick={() => setMarking(k)}
              className={`h-8 rounded-full px-3 text-xs font-semibold ${marking === k ? 'bg-brand text-white' : 'bg-surface-3 text-ink-soft'}`}
            >
              {k === 'pickup' ? '🏪 Mover la tienda' : '🏠 Mover al cliente'}
            </button>
          ))}
        </div>
        <LazyRouteMap
          label="Simulador de la tarifa del delivery"
          stops={[
            { point: pickup, kind: 'pickup', title: 'Tienda' },
            { point: dropoff, kind: 'dropoff', title: 'Cliente' },
          ]}
          paths={quote?.path ? [quote.path] : undefined}
          onPick={(p) => (marking === 'pickup' ? setPickup(p) : setDropoff(p))}
        />
        {quote && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3" data-testid="pricing-simulation">
            <Fact label="Tarifa al cliente" value={formatSoles(quote.feeCents)} strong />
            <Fact label="Distancia" value={`${quote.distanceKm.toFixed(2)} km`} />
            <Fact label="Tiempo estimado" value={`${quote.etaMinutes} min`} />
            <Fact label="Base" value={formatSoles(quote.baseCents)} />
            <Fact label="Por km" value={formatSoles(quote.distanceCents)} />
            <Fact label={`Combustible (${quote.fuelGallons.toFixed(3)} gal)`} value={formatSoles(quote.fuelCents)} />
            <p className="col-span-full text-xs text-ink-faint">
              Calculado {METHOD_LABEL[quote.method]} · línea recta {quote.straightLineKm.toFixed(2)} km · {quote.vehicle}
            </p>
          </dl>
        )}
      </Card>

      <Card icon={<Route className="size-5" />} title="Tarifa" footer="Tarifa = base + km × precio por km + combustible. Se redondea a 10 céntimos y queda entre el mínimo y el máximo.">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <NumberInput label="Base" value={form.base} onChange={(v) => set('base', v)} suffix="S/" />
          <NumberInput label="Por km" value={form.perKm} onChange={(v) => set('perKm', v)} suffix="S/" />
          <NumberInput label="Sin ubicación (plana)" value={form.flat} onChange={(v) => set('flat', v)} suffix="S/" />
          <NumberInput label="Mínimo" value={form.min} onChange={(v) => set('min', v)} suffix="S/" />
          <NumberInput label="Máximo" value={form.max} onChange={(v) => set('max', v)} suffix="S/" />
          <NumberInput label="Minutos fijos (recoger y entregar)" value={form.handlingMinutes} onChange={(v) => set('handlingMinutes', Number(v))} step="1" suffix="min" />
        </div>
      </Card>

      <Card
        icon={<Users className="size-5" />}
        title="Reparto de pedidos"
        footer="Óptima: cada pocos segundos se calcula, con los minutos por las calles de cada repartidor a cada tienda, el reparto de menor tiempo total (algoritmo húngaro). Si un repartidor ya va a esa tienda, se le suma el pedido."
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Cómo se reparten los pedidos">
          {(
            [
              ['optimal', 'Asignación óptima', 'Se le ofrece primero al repartidor que mejor conviene, solo a él por unos segundos.'],
              ['waves', 'Por oleadas', 'Se ofrece a todos los cercanos (3, 6, 12 km…) y el primero que lo toma se lo lleva.'],
            ] as const
          ).map(([id, label, hint]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={form.dispatchMode === id}
              onClick={() => set('dispatchMode', id)}
              className={`rounded-[var(--radius-card)] border p-3 text-left transition-colors ${form.dispatchMode === id ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/60' : 'border-line hover:border-teal-300'}`}
            >
              <span className="block text-sm font-bold text-ink">{label}</span>
              <span className="block text-xs text-ink-soft">{hint}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <NumberInput label="Pedidos por repartidor a la vez" value={form.maxActiveOrders} onChange={(v) => set('maxActiveOrders', Number(v))} step="1" suffix="1 a 5" />
          {form.dispatchMode === 'optimal' && (
            <NumberInput label="Tiempo para aceptar la oferta" value={form.exclusiveOfferSeconds} onChange={(v) => set('exclusiveOfferSeconds', Number(v))} step="5" suffix="seg" />
          )}
        </div>
      </Card>

      <Card icon={<Fuel className="size-5" />} title="Combustible y vehículos" footer="El margen cubre desgaste, aceite y llantas. Para cobrar solo por combustible, pon el precio por km en 0.">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <NumberInput label="Precio del galón" value={form.fuel} onChange={(v) => set('fuel', v)} suffix="S/" />
          <NumberInput label="Margen sobre el combustible" value={form.fuelMarginPercent} onChange={(v) => set('fuelMarginPercent', Number(v))} step="1" suffix="%" />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink-soft">Cotizar al cliente con</span>
            <select value={form.pricingVehicle} onChange={(e) => set('pricingVehicle', e.target.value as DriverVehicle)} className="h-10 rounded-[var(--radius-card)] bg-surface-3 px-3 text-ink outline-none">
              {VEHICLES.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        </div>
        {/* Una fila por vehículo con sus dos datos: entra en cualquier pantalla, sin deslizar. */}
        <ul className="flex flex-col divide-y divide-line" aria-label="Rendimiento y velocidad por vehículo">
          {VEHICLES.map((v) => (
            <li key={v} className="grid grid-cols-[minmax(4.5rem,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-end gap-2 py-2">
              <span className="pb-2 text-sm font-semibold text-ink">{v}</span>
              <label className="flex min-w-0 flex-col gap-0.5 text-[11px] text-ink-faint">
                km por galón
                <input aria-label={`Rendimiento de ${v}`} type="number" min="0" value={form.kmPerGallon[v]} onChange={(e) => setPerVehicle('kmPerGallon', v, e.target.value)} className="h-10 w-full min-w-0 rounded-lg bg-surface-3 px-2 text-sm text-ink outline-none" />
              </label>
              <label className="flex min-w-0 flex-col gap-0.5 text-[11px] text-ink-faint">
                km/h en la ciudad
                <input aria-label={`Velocidad de ${v}`} type="number" min="1" value={form.avgSpeedKmh[v]} onChange={(e) => setPerVehicle('avgSpeedKmh', v, e.target.value)} className="h-10 w-full min-w-0 rounded-lg bg-surface-3 px-2 text-sm text-ink outline-none" />
              </label>
            </li>
          ))}
        </ul>
      </Card>

      <Card icon={<Route className="size-5" />} title="Cálculo de la distancia">
        <Toggle
          checked={form.useStreetRouting}
          onChange={(v) => set('useStreetRouting', v)}
          label="Medir por las calles (OSRM)"
          description="La ruta real en moto o auto. Si el servicio no responde en 2.5 s, se usa la línea recta × el factor de calles."
        />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <NumberInput label="Factor de calles" value={form.streetFactor} onChange={(v) => set('streetFactor', Number(v))} step="0.05" suffix="×" />
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-faint">{saved.updatedAt ? `Último cambio: ${formatLongDate(saved.updatedAt)}${saved.updatedByName ? ` · ${saved.updatedByName}` : ''}` : 'Usando la tarifa por defecto'}</p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setForm(toForm(saved))}>
            Descartar
          </Button>
          <Button icon={<Save className="size-4" />} loading={saving} onClick={() => void save()}>
            Guardar tarifa
          </Button>
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className={strong ? 'text-lg font-extrabold text-ink' : 'font-semibold text-ink'}>{value}</dd>
    </div>
  );
}
