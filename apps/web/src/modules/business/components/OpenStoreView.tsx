import { ShieldCheck } from 'lucide-react';
import { Navigate } from 'react-router';
import { useBusinessStore } from '@shared/stores/business.store';
import { PageHeader, ServicePage } from '../../services/components/ServicesUi';
import { useOpenStore } from '../hooks/use-store-form.hook';
import { StoreForm } from './StoreForm';

/** «Abrir mi tienda»: la persona registra su negocio; soporte lo revisa y, si está bien, lo aprueba. */
export function OpenStoreView() {
  const business = useBusinessStore((s) => s.business);
  // Ya tiene tienda: se edita desde Mi negocio (una persona, una tienda).
  if (business) return <Navigate to="/app/negocio" replace />;
  return <OpenStoreForm />;
}

function OpenStoreForm() {
  const o = useOpenStore();
  return (
    <ServicePage>
      <PageHeader title="Abrir mi tienda" subtitle="Cuéntanos de tu negocio. Lo revisamos y, al aprobarlo, tus clientes ya pueden pedirte." onBack={o.back} />
      <StoreForm
        draft={o.draft}
        onChange={o.onChange}
        onPickLocation={o.onPickLocation}
        onUseMyLocation={o.useMyLocation}
        locating={o.locating}
        error={o.error}
        submitLabel="Enviar para revisión"
        saving={o.saving}
        onSubmit={o.submit}
      />
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink-faint">
        <ShieldCheck className="size-3.5" /> Después podrás subir tus productos o conectar tu propio sistema.
      </p>
    </ServicePage>
  );
}
