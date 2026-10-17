import { ChevronRight, Clock, Tags } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@shared/ui/Button';
import { Stars } from '@shared/ui/Stars';
import { Toggle } from '@shared/ui/Toggle';
import { useStoreSettings } from '../hooks/use-store-settings.hook';

const timeInput =
  'h-10 rounded-xl border border-line bg-surface px-3 text-[15px] text-ink outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/15';

/** «Mi tienda»: abierta o cerrada ahora, pausar los pedidos, horario y acceso al catálogo. */
export function StoreSettingsCard() {
  const s = useStoreSettings();
  if (!s.business) return null;
  const open = s.status?.open ?? true;
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-float md:p-5" aria-label="Mi tienda" data-testid="store-settings">
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${open ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200' : 'bg-rose-100 text-rose-900 dark:bg-rose-900/50 dark:text-rose-200'}`}
          data-testid="store-open"
          data-open={open}
        >
          <span className={`size-2 rounded-full ${open ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          {open ? 'Abierta ahora' : 'Cerrada'}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">{open ? 'Los clientes pueden hacer pedidos.' : s.status?.closedMessage}</span>
      </div>
      {s.status?.rating.average !== null && s.status?.rating.average !== undefined && (
        <p className="flex items-center gap-2 text-sm text-ink-soft" data-testid="store-rating">
          <Stars value={s.status.rating.average} /> {s.status.rating.average.toFixed(1)} · {s.status.rating.count} {s.status.rating.count === 1 ? 'calificación' : 'calificaciones'}
        </p>
      )}

      <Toggle
        checked={s.business.acceptingOrders}
        onChange={s.toggleAccepting}
        disabled={s.saving}
        label="Recibir pedidos"
        description="Apágalo si te quedaste sin personal o sin stock: nadie podrá pagar hasta que lo vuelvas a encender."
      />

      <div className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
        <span className="flex w-full items-center gap-1.5 text-sm font-semibold text-ink">
          <Clock className="size-4 text-brand" /> Horario (hora de Lima)
        </span>
        <label className="flex flex-col gap-1 text-xs text-ink-soft">
          Abre
          <input type="time" value={s.opensAt} onChange={(e) => s.onOpensAt(e.target.value)} aria-label="Abre" className={timeInput} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-soft">
          Cierra
          <input type="time" value={s.closesAt} onChange={(e) => s.onClosesAt(e.target.value)} aria-label="Cierra" className={timeInput} />
        </label>
        {s.hoursChanged && (
          <Button size="sm" onClick={s.saveHours} loading={s.saving} data-testid="save-hours">
            Guardar horario
          </Button>
        )}
        <span className="w-full text-xs text-ink-faint">{s.allDay ? 'Misma hora de apertura y cierre: atiendes las 24 horas.' : 'Si cierra antes de abrir, el horario cruza la medianoche.'}</span>
      </div>

      <Link
        to="/app/negocio/catalogo"
        data-testid="open-catalog"
        className="group -mx-1 flex items-center gap-3 rounded-xl px-1 py-2 transition-colors duration-200 hover:bg-surface-2"
      >
        <span className="flex size-9 items-center justify-center rounded-xl bg-teal-50 text-brand dark:bg-teal-950/60 dark:text-teal-300">
          <Tags className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-ink">Catálogo y precios</span>
          <span className="block text-sm text-ink-soft">Precios, ofertas y stock de tus productos</span>
        </span>
        <ChevronRight className="size-5 text-ink-faint transition-transform duration-200 group-hover:translate-x-0.5" />
      </Link>
    </section>
  );
}
