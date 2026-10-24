import type { BusinessInfo } from '@parla/types';
import { BadgeCheck } from 'lucide-react';
import { Navigate, useSearchParams } from 'react-router';
import { useBusinessStore } from '@shared/stores/business.store';
import { ListSkeleton } from '@shared/ui/States';
import { PageHeader, ServicePage } from '../../services/components/ServicesUi';
import { useEditStore } from '../hooks/use-store-form.hook';
import { StoreForm } from './StoreForm';

/** Datos de la tienda: nombre, descripción, dirección, ubicación y horario. */
export function StoreEditView() {
  const business = useBusinessStore((s) => s.business);
  if (business === null) return <Navigate to="/app/negocio/abrir" replace />;
  if (!business) {
    return (
      <ServicePage>
        <ListSkeleton rows={4} />
      </ServicePage>
    );
  }
  return <EditStoreForm business={business} />;
}

function EditStoreForm({ business }: { business: BusinessInfo }) {
  const e = useEditStore(business);
  const [params] = useSearchParams();
  return (
    <ServicePage>
      <PageHeader title="Datos de mi tienda" subtitle={business.name} onBack={e.back} />
      {params.get('confirmar') === '1' && (
        <p className="flex items-start gap-2 rounded-2xl bg-teal-50 p-3 text-sm text-ink dark:bg-teal-950/50" role="status" data-testid="confirm-ferrohub">
          <BadgeCheck className="mt-0.5 size-5 shrink-0 text-brand dark:text-teal-300" />
          Estos datos vienen de FerroHub. Revísalos y toca «Guardar cambios» para confirmar tu tienda.
        </p>
      )}
      <StoreForm
        draft={e.draft}
        onChange={e.onChange}
        onPickLocation={e.onPickLocation}
        onUseMyLocation={e.useMyLocation}
        locating={e.locating}
        lockCategory
        error={e.error}
        submitLabel="Guardar cambios"
        saving={e.saving}
        onSubmit={e.submit}
      />
    </ServicePage>
  );
}
