import type { BusinessInfo, GeoPoint, ServiceId } from '@parla/types';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useBusinessStore } from '@shared/stores/business.store';
import { toast } from '@shared/stores/toast.store';
import { errorMessage } from '@shared/utils/http';

export interface StoreDraft {
  name: string;
  service: ServiceId;
  description: string;
  address: string;
  location: GeoPoint | null;
  opensAt: string;
  closesAt: string;
}

const EMPTY_DRAFT: StoreDraft = { name: '', service: 'mercado', description: '', address: '', location: null, opensAt: '08:00', closesAt: '20:00' };

const draftOf = (business: BusinessInfo): StoreDraft => ({
  name: business.name,
  service: business.service,
  description: business.description,
  address: business.address,
  location: business.location,
  opensAt: business.opensAt,
  closesAt: business.closesAt,
});

/** Lo que falta o está mal en los datos de la tienda (null = todo bien). */
export function validateStoreDraft(draft: StoreDraft): string | null {
  if (draft.name.trim().length < 2) return 'Escribe el nombre de tu tienda.';
  if (draft.address.trim().length < 5) return 'Escribe la dirección de tu tienda (calle y número).';
  return null;
}

/** Formulario de los datos de la tienda (nombre, descripción, dirección, ubicación y horario). */
function useStoreDraft(initial: StoreDraft) {
  const [draft, setDraft] = useState<StoreDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  return {
    draft,
    error,
    saving,
    setSaving,
    setError,
    locating,
    onChange: (changes: Partial<StoreDraft>) => {
      setDraft((d) => ({ ...d, ...changes }));
      setError(null);
    },
    onPickLocation: (location: GeoPoint) => setDraft((d) => ({ ...d, location })),
    useMyLocation: () => {
      if (!navigator.geolocation) return toast('Tu navegador no comparte la ubicación. Marca el punto en el mapa.', 'error');
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setDraft((d) => ({ ...d, location: { lat: pos.coords.latitude, lng: pos.coords.longitude } }));
          setLocating(false);
        },
        () => {
          toast('No pudimos obtener tu ubicación. Marca el punto en el mapa.', 'error');
          setLocating(false);
        },
        { enableHighAccuracy: true, timeout: 10_000 },
      );
    },
  };
}

/** «Abrir mi tienda»: registra la tienda y la deja en revisión hasta que soporte la apruebe. */
export function useOpenStore() {
  const navigate = useNavigate();
  const registerStore = useBusinessStore((s) => s.registerStore);
  const form = useStoreDraft(EMPTY_DRAFT);

  return {
    ...form,
    back: () => navigate('/app/servicios'),
    submit: async () => {
      const problem = validateStoreDraft(form.draft);
      if (problem) return form.setError(problem);
      form.setSaving(true);
      try {
        await registerStore({
          name: form.draft.name.trim(),
          service: form.draft.service,
          description: form.draft.description.trim(),
          address: form.draft.address.trim(),
          location: form.draft.location,
          opensAt: form.draft.opensAt,
          closesAt: form.draft.closesAt,
        });
        toast('Listo: tu tienda está en revisión.', 'success');
        navigate('/app/negocio');
      } catch (err) {
        form.setError(errorMessage(err));
      } finally {
        form.setSaving(false);
      }
    },
  };
}

/** Editar los datos de la tienda ya registrada. */
export function useEditStore(business: BusinessInfo) {
  const navigate = useNavigate();
  const updateBusiness = useBusinessStore((s) => s.updateBusiness);
  const form = useStoreDraft(draftOf(business));

  return {
    ...form,
    back: () => navigate('/app/negocio'),
    submit: async () => {
      const problem = validateStoreDraft(form.draft);
      if (problem) return form.setError(problem);
      form.setSaving(true);
      try {
        await updateBusiness({
          name: form.draft.name.trim(),
          description: form.draft.description.trim(),
          address: form.draft.address.trim(),
          location: form.draft.location,
          opensAt: form.draft.opensAt,
          closesAt: form.draft.closesAt,
        });
        toast('Datos de la tienda guardados.', 'success');
        navigate('/app/negocio');
      } catch (err) {
        form.setError(errorMessage(err));
      } finally {
        form.setSaving(false);
      }
    },
  };
}
