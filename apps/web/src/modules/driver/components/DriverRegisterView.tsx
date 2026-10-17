import { Bike, KeyRound, MapPin, ShieldCheck, Wallet } from 'lucide-react';
import { Navigate } from 'react-router';
import { Button } from '@shared/ui/Button';
import { Field } from '@shared/ui/Field';
import { PhotoPicker } from '@shared/ui/PrivatePhoto';
import { PageHeader, ServicePage } from '../../services/components/ServicesUi';
import { useDriverRegister } from '../hooks/use-driver-profile.hook';
import { VehiclePicker } from './VehiclePicker';

const HOW_IT_WORKS = [
  { icon: ShieldCheck, text: 'Verificamos tu DNI y tu licencia (si manejas moto o auto) antes de tu primera entrega.' },
  { icon: Bike, text: 'Te conectas cuando quieres trabajar y te llegan los pedidos listos para recoger.' },
  { icon: MapPin, text: 'Mientras llevas un pedido, el cliente y la tienda te siguen en el mapa.' },
  { icon: KeyRound, text: 'Entregas con el código del cliente: así nadie se queda sin su pedido.' },
  { icon: Wallet, text: 'Ganas la tarifa de delivery de cada entrega (más propinas) y ves tus ganancias del día.' },
];

/** «Trabaja con Rapidito»: cualquier persona de Parla se registra como repartidor y queda en revisión. */
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
        <h2 className="mt-1 font-bold text-ink">Tus documentos</h2>
        <Field label="DNI" inputMode="numeric" placeholder="8 dígitos" value={r.dniNumber} onChange={(e) => r.onDni(e.target.value)} data-testid="driver-dni" />
        {r.needsPlate && (
          <Field label="Licencia de conducir" placeholder="ej. Q12345678" value={r.licenseNumber} onChange={(e) => r.onLicense(e.target.value)} autoCapitalize="characters" data-testid="driver-license" />
        )}
        <PhotoPicker
          label={r.needsPlate ? 'Foto de tu licencia de conducir' : 'Foto de tu DNI'}
          hint="Que se lean bien tu nombre, el número y la foto. Solo la ve el equipo de soporte."
          onChange={r.setDocumentPhotoId}
          testId="driver-document"
        />
        {r.error && <p role="alert" className="text-sm font-semibold text-rose-700 dark:text-rose-400">{r.error}</p>}
        <Button type="submit" size="lg" fullWidth icon={<Bike className="size-5" />} loading={r.saving} data-testid="register-driver">
          Enviar para revisión
        </Button>
      </form>
    </ServicePage>
  );
}
