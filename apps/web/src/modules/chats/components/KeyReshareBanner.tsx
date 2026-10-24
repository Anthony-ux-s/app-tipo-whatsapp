import type { ConversationSummary } from '@parla/types';
import { KeyRound, ShieldAlert } from 'lucide-react';
import { Button } from '@shared/ui/Button';
import { useKeyReshare } from '../hooks/use-key-reshare.hook';

/** Aviso cuando cambió la clave de seguridad de alguien del chat (restableció su cuenta). */
export function KeyReshareBanner({ conversation }: { conversation: ConversationSummary }) {
  const k = useKeyReshare(conversation);

  if (k.waitingForMe) {
    return (
      <div className="flex items-start gap-3 border-b border-line bg-cyan-50 px-4 py-3 text-sm text-ink dark:bg-cyan-950/60 dark:text-ink" data-testid="key-waiting">
        <KeyRound className="mt-0.5 size-4 shrink-0" />
        <p>Restableciste tu cuenta: estos mensajes se cifraron con tu clave anterior. Cuando alguien del chat te lo vuelva a compartir, podrás leerlos.</p>
      </div>
    );
  }

  if (!k.canShare) return null;
  const names = k.pending.map((u) => u.displayName).join(', ');
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line bg-cyan-50 px-4 py-3 text-sm text-ink dark:bg-cyan-950/60 dark:text-ink" data-testid="key-reshare">
      <ShieldAlert className="size-5 shrink-0" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">{names}</span> restableció su cuenta y cambió su clave de seguridad. Si confías en que es la misma persona, vuelve a compartirle el chat.
      </p>
      <Button size="sm" loading={k.busy} onClick={() => void k.share()}>
        Compartir el chat
      </Button>
    </div>
  );
}
