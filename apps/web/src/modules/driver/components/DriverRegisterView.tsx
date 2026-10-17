import { Bike, KeyRound, MapPin, Wallet } from 'lucide-react';
import { Navigate } from 'react-router';
import { Button } from '@shared/ui/Button';
import { PageHeader, ServicePage } from '../../services/components/ServicesUi';
import { useDriverRegister } from '../hooks/use-driver-profile.hook';
import { VehiclePicker } from './VehiclePicker';

const HOW_IT_WORKS = [
  { icon: Bike, text: 'Te conectas cuando quieres trabajar y te llegan los pedidos listos para recoger.' },
  { icon: MapPin, text: 'Mientras llevas un pedido, el cliente y la tienda te siguen en el mapa.' },
  { icon: KeyRound, text: 'Entregas con el código del cliente: así nadie se queda sin su pedido.' },
  { icon: Wallet, text: 'Ganas la tarifa de delivery de cada entrega y ves tus ganancias del día.' },
];

/** «Trabaja con Rapidito»: cualquier persona de Parla se registra como repartidor. */
export function DriverRegisterView() {
  const r = useDriverRegister();
  if (r.alreadyDriver) return <Navigate to="/app/rapidito" replace />;
  return (
    <ServicePage>
      <PageHeader title="Trabaja con Rapidito" subtitle="Reparte pedidos en tu zona, a tu ritmo." onBack={r.back} />

      <ul className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-float md:p-5">
        {HOW_IT_WORKS.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-3 text-sm text-ink">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-brand dark:bg-teal-950/60 dark:text-teal-300">
              <Icon className="size-4" />
            </span>
            <span className="pt-1.5">{text}</span>
          </li>
        ))}
      </ul>

      <form onSubmit={r.submit} className="flex flex-col gap-4 rounded-2xl bg-surface p-4 shadow-float md:p-5" aria-label="Registro de repartidor">
        <h2 className="font-bold text-ink">¿Con qué repartes?</h2>
        <VehiclePicker vehicle={r.vehicle} plate={r.plate} needsPlate={r.needsPlate} onVehicle={r.selectVehicle} onPlate={r.onPlate} />
        {r.error && <p role="alert" className="text-sm font-semibold text-rose-700 dark:text-rose-400">{r.error}</p>}
        <Button type="submit" size="lg" fullWidth icon={<Bike className="size-5" />} loading={r.saving} data-testid="register-driver">
          Registrarme como repartidor
        </Button>
      </form>
    </ServicePage>
  );
}
