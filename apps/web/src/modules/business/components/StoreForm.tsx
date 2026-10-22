import type { GeoPoint, ServiceId } from '@parla/types';
import { LocateFixed } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@shared/ui/Button';
import { Field, FieldError, TextAreaField } from '@shared/ui/Field';
import { LazyDeliveryMap } from '@shared/ui/LazyDeliveryMap';
import { SERVICE_IDS, SERVICE_VISUALS } from '../../services/const/services.const';
import type { StoreDraft } from '../hooks/use-store-form.hook';

const timeInput =
  'h-12 rounded-xl border border-line bg-surface px-3 text-[15px] text-ink outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/15';

interface StoreFormProps {
  draft: StoreDraft;
  onChange: (changes: Partial<StoreDraft>) => void;
  onPickLocation: (point: GeoPoint) => void;
  onUseMyLocation: () => void;
  locating: boolean;
  /** Al editar, la categoría no se cambia. */
  lockCategory?: boolean;
  error: string | null;
  submitLabel: string;
  saving: boolean;
  onSubmit: () => void;
  footer?: ReactNode;
}

/** Datos de una tienda: nombre, categoría, descripción, dirección, punto en el mapa y horario. */
export function StoreForm({ draft, onChange, onPickLocation, onUseMyLocation, locating, lockCategory = false, error, submitLabel, saving, onSubmit, footer }: StoreFormProps) {
  return (
    <form
      className="flex flex-col gap-4 rounded-2xl bg-surface p-4 shadow-float md:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      data-testid="store-form"
    >
      <Field label="Nombre de la tienda" placeholder="ej. Bodega Doña Rosa" maxLength={60} value={draft.name} onChange={(e) => onChange({ name: e.target.value })} required />

      <fieldset className="flex flex-col gap-1.5" disabled={lockCategory}>
        <legend className="mb-1.5 text-sm font-medium text-ink">¿Qué vendes?</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SERVICE_IDS.map((id: ServiceId) => (
            <label
              key={id}
              className={`flex cursor-pointer items-center justify-center rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition-colors duration-200 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 ${draft.service === id ? 'border-brand bg-teal-50 text-brand dark:bg-teal-950/60 dark:text-teal-300' : 'border-line text-ink-soft hover:border-teal-300'}`}
            >
              <input type="radio" name="categoria" value={id} checked={draft.service === id} onChange={() => onChange({ service: id })} className="sr-only" />
              {SERVICE_VISUALS[id].title}
            </label>
          ))}
        </div>
        {lockCategory && <span className="text-xs text-ink-faint">La categoría no se puede cambiar. Si te equivocaste, escríbenos a soporte.</span>}
      </fieldset>

      <TextAreaField label="Descripción (opcional)" placeholder="Cuéntales a tus clientes qué vendes" maxLength={300} value={draft.description} onChange={(e) => onChange({ description: e.target.value })} />

      <Field label="Dirección" placeholder="ej. Av. Larco 123, Miraflores" maxLength={200} value={draft.address} onChange={(e) => onChange({ address: e.target.value })} required />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-ink-soft">
            {draft.location ? 'Ubicación marcada. Arrástrala o toca otro lugar para corregirla.' : 'Toca el mapa para marcar dónde está tu tienda (opcional, ayuda al repartidor).'}
          </p>
          <Button variant="ghost" size="sm" icon={<LocateFixed className="size-4" />} onClick={onUseMyLocation} loading={locating}>
            Usar mi ubicación
          </Button>
        </div>
        <LazyDeliveryMap destination={draft.location} onPick={onPickLocation} label="Mapa para marcar la ubicación de la tienda" />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <span className="w-full text-sm font-medium text-ink">Horario de atención (hora de Lima)</span>
        <label className="flex flex-col gap-1 text-xs text-ink-soft">
          Abre
          <input type="time" value={draft.opensAt} onChange={(e) => onChange({ opensAt: e.target.value })} className={timeInput} required />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-soft">
          Cierra
          <input type="time" value={draft.closesAt} onChange={(e) => onChange({ closesAt: e.target.value })} className={timeInput} required />
        </label>
        <span className="w-full text-xs text-ink-faint">{draft.opensAt === draft.closesAt ? 'Misma hora de apertura y cierre: atiendes las 24 horas.' : 'Si cierra antes de abrir, el horario cruza la medianoche.'}</span>
      </div>

      {error && <FieldError message={error} />}

      <Button type="submit" size="lg" fullWidth loading={saving} data-testid="store-form-submit">
        {submitLabel}
      </Button>
      {footer}
    </form>
  );
}
