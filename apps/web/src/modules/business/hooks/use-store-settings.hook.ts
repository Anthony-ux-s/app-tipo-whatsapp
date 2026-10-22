import { useEffect, useState } from 'react';
import { useBusinessStore } from '@shared/stores/business.store';
import { toast } from '@shared/stores/toast.store';
import { errorMessage } from '@shared/utils/http';

/** «Mi tienda»: si recibe pedidos ahora, pausar o reanudarlos, y el horario de atención. */
export function useStoreSettings() {
  const business = useBusinessStore((s) => s.business);
  const status = useBusinessStore((s) => s.storeStatus);
  const loadStoreStatus = useBusinessStore((s) => s.loadStoreStatus);
  const updateBusiness = useBusinessStore((s) => s.updateBusiness);
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadStoreStatus().catch(() => undefined);
    // El estado depende de la hora: se revisa cada minuto mientras el panel está abierto.
    const timer = window.setInterval(() => void loadStoreStatus().catch(() => undefined), 60_000);
    return () => window.clearInterval(timer);
  }, [loadStoreStatus, business?.id]);

  useEffect(() => {
    if (!business) return;
    setOpensAt(business.opensAt);
    setClosesAt(business.closesAt);
  }, [business]);

  const save = async (changes: Parameters<typeof updateBusiness>[0], done: string) => {
    setSaving(true);
    try {
      await updateBusiness(changes);
      toast(done, 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return {
    business,
    status,
    opensAt,
    closesAt,
    saving,
    allDay: opensAt === closesAt,
    hoursChanged: !!business && (opensAt !== business.opensAt || closesAt !== business.closesAt),
    onOpensAt: setOpensAt,
    onClosesAt: setClosesAt,
    toggleAccepting: (accepting: boolean) =>
      save({ acceptingOrders: accepting }, accepting ? 'Volviste a recibir pedidos.' : 'Pausaste los pedidos: nadie puede pagar hasta que los reanudes.'),
    saveHours: () => save({ opensAt, closesAt }, 'Horario guardado.'),
  };
}
