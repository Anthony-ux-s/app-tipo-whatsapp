import type { BusinessInfo } from '@parla/types';
import { Navigate } from 'react-router';
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
  return (
    <ServicePage>
      <PageHeader title="Datos de mi tienda" subtitle={business.name} onBack={e.back} />
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
