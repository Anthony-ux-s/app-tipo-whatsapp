import type { BigOrderRules } from '@parla/types';
import { MessageCircle, PackageOpen } from 'lucide-react';
import { whatsappLink } from '@shared/utils/big-order';

interface BigOrderNoticeProps {
  rules: BigOrderRules;
  storeName: string;
  /** Resumen del pedido, ya escrito para el mensaje de WhatsApp. */
  summary: string;
  /** Antes de pagar (cotización) o con el pedido ya hecho. */
  stage: 'quote' | 'order';
}

/**
 * Pedido grande (obra, mucha cantidad): la tienda lo confirma con el cliente antes de prepararlo. Se le dice con
 * claridad y se le da cómo hablar con la tienda al instante.
 */
export function BigOrderNotice({ rules, storeName, summary, stage }: BigOrderNoticeProps) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200 md:p-5 dark:bg-amber-950/40 dark:ring-amber-900" aria-label="Pedido grande" data-testid="big-order-notice">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/80 text-ink dark:bg-black/25">
          <PackageOpen className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-ink">Es un pedido grande</p>
          <p className="text-sm text-ink-soft">
            {storeName} lo confirmará contigo por chat y por WhatsApp antes de despacharlo (revisa el stock, el tiempo y si hace falta una camioneta).
            {stage === 'quote' ? ' Después de pagar podrás escribirle por el chat del pedido.' : ' Escríbele para acelerar la confirmación.'}
          </p>
        </div>
      </div>
      {rules.whatsapp && (
        <a
          href={whatsappLink(rules.whatsapp, summary)}
          target="_blank"
          rel="noreferrer"
          data-testid="big-order-whatsapp"
          className="inline-flex h-11 items-center justify-center gap-2 self-start rounded-xl bg-white px-4 text-sm font-bold text-ink shadow-float ring-1 ring-line transition-colors hover:bg-surface-2 dark:bg-black/25"
        >
          <MessageCircle className="size-4" /> Escribir a la tienda por WhatsApp
        </a>
      )}
    </section>
  );
}
