import { LogOut, Save } from 'lucide-react';
import { Navigate } from 'react-router';
import { Button } from '@shared/ui/Button';
import { Field } from '@shared/ui/Field';
import { Modal } from '@shared/ui/Modal';
import { Stars } from '@shared/ui/Stars';
import { Toggle } from '@shared/ui/Toggle';
import { formatSoles } from '@shared/utils/money';
import { PageHeader, ServicePage } from '../../services/components/ServicesUi';
import { useDriverProfile } from '../hooks/use-driver-profile.hook';
import { DriverReviewCard } from './DriverReviewCard';
import { DriverWalletCard } from './DriverWalletCard';
import { VehiclePicker } from './VehiclePicker';

/** Perfil del repartidor de Rapidito: ganancias, conectado, vehículo y dejar de repartir. */
export function DriverProfileView() {
  const p = useDriverProfile();
  if (p.driver === null) return <Navigate to="/app/rapidito/registro" replace />;
  if (!p.driver) return null;
  const e = p.earnings;
  return (
    <ServicePage>
      <PageHeader title="Mi perfil de repartidor" subtitle="Rapidito" onBack={p.back} />

      <section className="grid grid-cols-3 gap-2" aria-label="Ganancias" data-testid="driver-earnings">
        {[
          ['Hoy', e?.todayCents, e?.todayDeliveries],
          ['7 días', e?.weekCents, e?.weekDeliveries],
          ['Total', e?.totalCents, e?.totalDeliveries],
        ].map(([label, cents, count]) => (
          <div key={label as string} className="rounded-2xl bg-surface p-3 text-center shadow-float">
            <p className="text-xs font-semibold text-ink-soft">{label}</p>
            <p className="text-lg font-extrabold text-ink">{cents === undefined ? '—' : formatSoles(cents as number)}</p>
            <p className="text-xs text-ink-faint">{count === undefined ? '' : `${count} ${count === 1 ? 'entrega' : 'entregas'}`}</p>
          </div>
        ))}
      </section>

      {e && (
        <p className="-mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-ink-soft" data-testid="driver-rating">
          {e.tipsCents > 0 && <span>Propinas: <span className="font-semibold text-ink">{formatSoles(e.tipsCents)}</span></span>}
          {e.commissionCents > 0 && <span>Comisión Rapidito: <span className="font-semibold text-ink">{formatSoles(e.commissionCents)}</span></span>}
          {e.rating.average !== null ? (
            <span className="flex items-center gap-1.5">
              <Stars value={e.rating.average} /> {e.rating.average.toFixed(1)} ({e.rating.count})
            </span>
          ) : (
            <span>Aún sin calificaciones</span>
          )}
        </p>
      )}

      <DriverReviewCard driver={p.driver} />

      <DriverWalletCard />

      <section className="rounded-2xl bg-surface p-4 shadow-float md:p-5">
        <Toggle
          checked={p.driver.online}
          onChange={p.toggleOnline}
          disabled={p.busy === 'online' || p.driver.status !== 'approved'}
          label="Conectado"
          description="Conectado te llegan los pedidos listos para recoger. Desconéctate al terminar tu jornada."
        />
      </section>

      <form onSubmit={p.save} className="flex flex-col gap-4 rounded-2xl bg-surface p-4 shadow-float md:p-5" aria-label="Vehículo">
        <h2 className="font-bold text-ink">Tu vehículo</h2>
        <VehiclePicker vehicle={p.vehicle} plate={p.plate} needsPlate={p.needsPlate} onVehicle={p.selectVehicle} onPlate={p.onPlate} />
        {p.needsPlate && p.vehicle !== p.driver.vehicle && (
          <Field label="Licencia de conducir" hint="Si no la registraste antes" placeholder="ej. Q12345678" value={p.licenseNumber} onChange={(e) => p.onLicense(e.target.value)} autoCapitalize="characters" />
        )}
        {p.error && <p role="alert" className="text-sm font-semibold text-rose-700 dark:text-rose-400">{p.error}</p>}
        {p.changed && (
          <Button type="submit" icon={<Save className="size-4" />} loading={p.busy === 'save'} className="self-start" data-testid="save-vehicle">
            Guardar vehículo
          </Button>
        )}
      </form>

      <Button variant="ghost" className="self-center" icon={<LogOut className="size-4" />} onClick={p.askLeave} data-testid="leave-driver">
        Dejar de repartir
      </Button>

      <Modal
        open={p.confirmLeave}
        onClose={p.closeLeave}
        size="sm"
        title="¿Dejar de repartir?"
        footer={
          <>
            <Button variant="ghost" onClick={p.closeLeave}>Volver</Button>
            <Button variant="danger" icon={<LogOut className="size-4" />} onClick={p.leave} loading={p.busy === 'leave'} data-testid="confirm-leave">Dejar de repartir</Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">Ya no te llegarán pedidos. Tus entregas quedan en el historial y puedes volver a registrarte cuando quieras.</p>
      </Modal>
    </ServicePage>
  );
}
