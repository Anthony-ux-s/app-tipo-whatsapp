import type { DriverVehicle } from '@parla/types';
import { Bike, Car, Footprints, type LucideIcon } from 'lucide-react';
import { Field } from '@shared/ui/Field';
import { VEHICLES } from '../hooks/use-driver-profile.hook';

const ICONS: Record<DriverVehicle, LucideIcon> = { Moto: Bike, Bicicleta: Bike, Auto: Car, 'A pie': Footprints };

/** Elegir vehículo (y la placa si lleva). */
export function VehiclePicker({
  vehicle,
  plate,
  needsPlate,
  onVehicle,
  onPlate,
}: {
  vehicle: DriverVehicle;
  plate: string;
  needsPlate: boolean;
  onVehicle: (v: DriverVehicle) => void;
  onPlate: (p: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Vehículo" className="grid grid-cols-4 gap-2">
        {VEHICLES.map((v) => {
          const Icon = ICONS[v.id];
          const on = vehicle === v.id;
          return (
            <button
              key={v.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onVehicle(v.id)}
              className={`flex flex-col items-center gap-1.5 rounded-2xl px-1 py-3 text-xs font-semibold transition-colors duration-200 ${on ? 'bg-teal-100 text-ink ring-2 ring-teal-500 dark:bg-teal-900/60 dark:text-ink' : 'bg-surface-3 text-ink-soft hover:text-ink'}`}
            >
              <Icon className="size-6" />
              {v.label}
            </button>
          );
        })}
      </div>
      {needsPlate && <Field label="Placa" placeholder="ej. B7K-482" value={plate} maxLength={10} onChange={(e) => onPlate(e.target.value)} autoCapitalize="characters" />}
    </div>
  );
}
