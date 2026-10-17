import type { DriverInfo } from '@parla/types';
import { Clock3, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { useDriverStore } from '@shared/stores/driver.store';
import { toast } from '@shared/stores/toast.store';
import { Button } from '@shared/ui/Button';
import { PhotoPicker } from '@shared/ui/PrivatePhoto';
import { errorMessage } from '@shared/utils/http';

/**
 * Mientras soporte no lo aprueba, el repartidor no puede conectarse: aquí ve si está en revisión o por
 * qué lo rechazaron, y puede mandar otra foto de su documento.
 */
export function DriverReviewCard({ driver }: { driver: DriverInfo }) {
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  if (driver.status === 'approved') return null;
  const rejected = driver.status === 'rejected';
  const needsDocument = rejected || !driver.hasDocument;

  const send = async () => {
    if (!photoId) return;
    setSending(true);
    try {
      await useDriverStore.getState().setDocument(photoId);
      setPhotoId(null);
      toast('Documento enviado: lo revisaremos pronto.', 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <section
      className={`flex flex-col gap-3 rounded-2xl p-4 ring-1 md:p-5 ${rejected ? 'bg-rose-50 ring-rose-200 dark:bg-rose-950/40 dark:ring-rose-900' : 'bg-amber-50 ring-amber-200 dark:bg-amber-950/40 dark:ring-amber-900'}`}
      aria-label="Verificación"
      data-testid="driver-review"
      data-status={driver.status}
    >
      <div className="flex items-start gap-3">
        {rejected ? <ShieldAlert className="size-6 shrink-0 text-rose-700 dark:text-rose-300" /> : <Clock3 className="size-6 shrink-0 text-amber-700 dark:text-amber-300" />}
        <div className="min-w-0 text-sm text-ink">
          <p className="font-bold">{rejected ? 'No pudimos aprobar tus documentos' : 'Estamos revisando tus documentos'}</p>
          <p className="text-ink-soft">
            {rejected
              ? `Motivo: ${driver.reviewNote || 'revisa tus datos'}. Corrígelo y vuelve a enviar la foto.`
              : driver.hasDocument
                ? 'Te avisaremos apenas te aprobemos; luego podrás conectarte y recibir pedidos.'
                : 'Falta la foto de tu documento para poder revisarte.'}
          </p>
        </div>
      </div>
      {needsDocument && (
        <>
          <PhotoPicker label="Foto de tu documento" onChange={setPhotoId} testId="driver-document-again" />
          <Button onClick={send} disabled={!photoId} loading={sending} className="self-start" data-testid="send-document">
            Enviar documento
          </Button>
        </>
      )}
    </section>
  );
}
