import type { BusinessInfo } from '@parla/types';
import { BadgeCheck, ExternalLink, Link2Off, PlugZap } from 'lucide-react';
import { Button } from '@shared/ui/Button';
import { Modal } from '@shared/ui/Modal';
import { useFerrohubLink } from '../hooks/use-ferrohub.hook';

/** «Mi negocio» de una tienda conectada a FerroHub: estado de la conexión, su panel y «Desvincular». */
export function FerrohubCard({ business }: { business: BusinessInfo }) {
  const f = useFerrohubLink(business);
  if (!f.connected) return null;
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-float md:p-5" aria-label="Conexión con FerroHub" data-testid="ferrohub-card">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-brand dark:bg-teal-950/60 dark:text-teal-300">
          <PlugZap className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold text-ink">Conectado a FerroHub</span>
          <span className="block text-sm text-ink-soft">Tus productos, precios y stock son siempre los de tu ferretería.</span>
        </span>
        {f.verified && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-ink dark:bg-teal-950/60" data-testid="verified-badge">
            <BadgeCheck className="size-4 text-brand dark:text-teal-300" /> Verificada
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" icon={<ExternalLink className="size-4" />} loading={f.openingPanel} onClick={f.openPanel} data-testid="ferrohub-panel">
          Abrir mi panel FerroHub
        </Button>
        <Button variant="ghost" icon={<Link2Off className="size-4" />} onClick={f.askUnlink} data-testid="ferrohub-unlink">
          Desvincular
        </Button>
      </div>
      <Modal
        open={f.confirming}
        onClose={f.cancelUnlink}
        title="¿Desvincular tu tienda de FerroHub?"
        description="Parla dejará de leer tus productos y de enviarte pedidos. Podrás volver a conectarla con un código nuevo."
        footer={
          <>
            <Button variant="ghost" onClick={f.cancelUnlink}>
              Cancelar
            </Button>
            <Button loading={f.unlinking} onClick={f.unlink} data-testid="ferrohub-unlink-confirm">
              Desvincular
            </Button>
          </>
        }
      >
        <span className="sr-only">Confirma que quieres desvincular la tienda.</span>
      </Modal>
    </section>
  );
}
