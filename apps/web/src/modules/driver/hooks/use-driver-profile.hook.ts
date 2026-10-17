import type { DriverVehicle } from '@parla/types';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useDriverStore } from '@shared/stores/driver.store';
import { toast } from '@shared/stores/toast.store';
import { errorMessage } from '@shared/utils/http';

export const VEHICLES: { id: DriverVehicle; label: string; needsPlate: boolean }[] = [
  { id: 'Moto', label: 'Moto', needsPlate: true },
  { id: 'Bicicleta', label: 'Bicicleta', needsPlate: false },
  { id: 'Auto', label: 'Auto', needsPlate: true },
  { id: 'A pie', label: 'A pie', needsPlate: false },
];

/** Formulario de vehículo y placa: alta («Trabaja con Rapidito») o edición del perfil. */
function useVehicleForm(initial: { vehicle: DriverVehicle; plate: string }) {
  const [vehicle, setVehicle] = useState<DriverVehicle>(initial.vehicle);
  const [plate, setPlate] = useState(initial.plate);
  const [licenseNumber, setLicense] = useState('');
  const [error, setError] = useState<string | null>(null);
  const needsPlate = VEHICLES.find((v) => v.id === vehicle)?.needsPlate ?? false;
  return {
    vehicle,
    plate,
    error,
    setError,
    needsPlate,
    selectVehicle: (v: DriverVehicle) => {
      setVehicle(v);
      setError(null);
    },
    onPlate: (value: string) => {
      setPlate(value.toUpperCase());
      setError(null);
    },
    licenseNumber,
    onLicense: (value: string) => {
      setLicense(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 9));
      setError(null);
    },
    reset: (v: DriverVehicle, p: string) => {
      setVehicle(v);
      setPlate(p);
    },
    profile: () => ({ vehicle, plate: needsPlate ? plate : '', ...(needsPlate && licenseNumber ? { licenseNumber } : {}) }),
  };
}

export function useDriverRegister() {
  const navigate = useNavigate();
  const driver = useDriverStore((s) => s.driver);
  const register = useDriverStore((s) => s.register);
  const form = useVehicleForm({ vehicle: 'Moto', plate: '' });
  const [dniNumber, setDni] = useState('');
  const [documentPhotoId, setDocumentPhotoId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  return {
    ...form,
    dniNumber,
    onDni: (value: string) => {
      setDni(value.replace(/\D/g, '').slice(0, 8));
      form.setError(null);
    },
    documentPhotoId,
    setDocumentPhotoId,
    alreadyDriver: !!driver,
    saving,
    back: () => navigate('/app/pedidos'),
    submit: async (event?: FormEvent) => {
      event?.preventDefault();
      if (!documentPhotoId) {
        form.setError(form.needsPlate ? 'Sube una foto de tu licencia de conducir' : 'Sube una foto de tu DNI');
        return;
      }
      setSaving(true);
      try {
        await register({ ...form.profile(), dniNumber });
        await useDriverStore.getState().setDocument(documentPhotoId);
        toast('¡Listo! Revisaremos tus datos y te avisaremos cuando puedas conectarte.', 'success');
        navigate('/app/rapidito');
      } catch (err) {
        form.setError(errorMessage(err));
      } finally {
        setSaving(false);
      }
    },
  };
}

/** Perfil del repartidor: ganancias, vehículo, conectado y dejar de repartir. */
export function useDriverProfile() {
  const navigate = useNavigate();
  const driver = useDriverStore((s) => s.driver);
  const earnings = useDriverStore((s) => s.earnings);
  const loadEarnings = useDriverStore((s) => s.loadEarnings);
  const form = useVehicleForm({ vehicle: driver?.vehicle ?? 'Moto', plate: driver?.plate ?? '' });
  const [busy, setBusy] = useState<'save' | 'online' | 'leave' | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    void loadEarnings().catch(() => undefined);
  }, [loadEarnings]);
  useEffect(() => {
    if (driver) form.reset(driver.vehicle, driver.plate);
  }, [driver?.vehicle, driver?.plate]);

  const run = async (action: 'save' | 'online' | 'leave', fn: () => Promise<void>, done: string) => {
    setBusy(action);
    try {
      await fn();
      toast(done, 'success');
      return true;
    } catch (err) {
      const message = errorMessage(err);
      if (action === 'save') form.setError(message);
      else toast(message, 'error');
      return false;
    } finally {
      setBusy(null);
      setConfirmLeave(false);
    }
  };

  return {
    ...form,
    driver,
    earnings,
    busy,
    changed: !!driver && (form.vehicle !== driver.vehicle || (form.needsPlate && form.plate !== driver.plate)),
    back: () => navigate('/app/rapidito'),
    save: (event?: FormEvent) => {
      event?.preventDefault();
      void run('save', () => useDriverStore.getState().updateProfile(form.profile()), 'Vehículo actualizado.');
    },
    toggleOnline: (online: boolean) =>
      run('online', () => useDriverStore.getState().setOnline(online), online ? 'Conectado: te llegarán pedidos.' : 'Desconectado: no te llegarán pedidos.'),
    confirmLeave,
    askLeave: () => setConfirmLeave(true),
    closeLeave: () => setConfirmLeave(false),
    leave: async () => {
      if (await run('leave', () => useDriverStore.getState().leave(), 'Dejaste de repartir. Puedes volver cuando quieras.')) navigate('/app/pedidos');
    },
  };
}
