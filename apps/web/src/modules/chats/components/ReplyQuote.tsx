import type { ReplyReference } from '@parla/types';
import type { DecryptedText } from '@shared/types/chat.types';
import { MEDIA_LABELS } from '../const/chats.const';

interface ReplyQuoteProps {
  reply: ReplyReference;
  author: { name: string; color: string };
  text: DecryptedText | undefined;
  onOpen?: () => void;
}

const BAR: Record<string, string> = {
  teal: 'border-teal-500',
  emerald: 'border-emerald-500',
  cyan: 'border-cyan-500',
  'teal-dark': 'border-teal-700',
  'emerald-dark': 'border-emerald-700',
  'cyan-dark': 'border-cyan-700',
};

/** Cita del mensaje al que se responde (toca para abrir el hilo). */
export function ReplyQuote({ reply, author, text, onOpen }: ReplyQuoteProps) {
  const preview = text?.ok && text.text ? text.text : MEDIA_LABELS[reply.kind];
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!onOpen}
      data-testid="reply-quote"
      className={`mb-1 block w-full rounded-lg border-l-4 bg-black/5 px-2.5 py-1.5 text-left dark:bg-white/5 ${BAR[author.color] ?? BAR.teal}`}
    >
      <span className="block truncate text-[11px] font-semibold text-teal-700 dark:text-teal-300">{author.name}</span>
      <span className="line-clamp-2 text-[12px] text-ink-soft">{preview}</span>
    </button>
  );
}
