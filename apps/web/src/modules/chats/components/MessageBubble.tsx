import type { ConversationSummary } from '@parla/types';
import { Lock, RotateCcw } from 'lucide-react';
import type { ChatMessage, DecryptedText } from '@shared/types/chat.types';
import { formatTime } from '@shared/utils/date';
import { DeliveryTicks } from './DeliveryTicks';
import { MediaContent } from './MediaContent';

interface MessageBubbleProps {
  conversation: ConversationSummary;
  message: ChatMessage;
  text: DecryptedText | undefined;
  outgoing: boolean;
  firstOfRun: boolean;
  lastOfRun: boolean;
  senderName: string | null;
  senderColor: string;
  onOpenImage: (url: string) => void;
  onRetry: (clientId: string) => void;
}

const NAME_COLORS: Record<string, string> = {
  teal: 'text-teal-600 dark:text-teal-300',
  emerald: 'text-emerald-600 dark:text-emerald-300',
  cyan: 'text-cyan-600 dark:text-cyan-300',
  'teal-dark': 'text-teal-800 dark:text-teal-200',
  'emerald-dark': 'text-emerald-800 dark:text-emerald-200',
  'cyan-dark': 'text-cyan-800 dark:text-cyan-200',
};

export function MessageBubble({
  conversation,
  message,
  text,
  outgoing,
  firstOfRun,
  lastOfRun,
  senderName,
  senderColor,
  onOpenImage,
  onRetry,
}: MessageBubbleProps) {
  if (message.kind === 'system') {
    return (
      <div className="my-2 flex justify-center px-4">
        <span className="rounded-lg bg-surface/90 px-3 py-1.5 text-center text-xs text-ink-soft shadow-float">{message.systemText}</span>
      </div>
    );
  }

  const isMedia = message.kind !== 'text' && message.media;
  const caption = text?.ok ? text.text : '';
  const tail = firstOfRun
    ? outgoing
      ? 'rounded-tr-[4px]'
      : 'rounded-tl-[4px]'
    : '';

  return (
    <div className={`flex px-3 md:px-[6%] ${outgoing ? 'justify-end' : 'justify-start'} ${firstOfRun ? 'mt-2' : 'mt-0.5'} ${lastOfRun ? 'mb-0.5' : ''}`}>
      <div
        data-testid="message"
        data-status={message.status}
        className={`relative max-w-[85%] animate-rise rounded-[var(--radius-bubble)] shadow-float md:max-w-[65%] ${tail} ${outgoing ? 'bg-bubble-out' : 'bg-bubble-in'} ${isMedia ? 'p-1' : 'px-3 pt-1.5 pb-1.5'}`}
      >
        {senderName && firstOfRun && !outgoing && (
          <p className={`text-[13px] font-semibold ${NAME_COLORS[senderColor] ?? NAME_COLORS.teal} ${isMedia ? 'px-2 pt-1 pb-1' : ''}`}>{senderName}</p>
        )}
        {isMedia && message.media && (
          <MediaContent
            conversation={conversation}
            kind={message.kind as 'image' | 'audio' | 'video'}
            media={message.media}
            localPreviewUrl={message.localPreviewUrl}
            outgoing={outgoing}
            onOpenImage={onOpenImage}
          />
        )}
        {message.kind === 'text' && !text && <p className="text-[15px] text-ink-faint italic">Descifrando…</p>}
        {text && !text.ok && (
          <p className="flex items-center gap-1.5 text-[14px] text-ink-soft italic">
            <Lock className="size-3.5" /> No se pudo descifrar este mensaje
          </p>
        )}
        <div className={`flex flex-wrap items-end justify-end gap-x-2 ${isMedia ? 'px-2 pb-1' : ''}`}>
          {caption && (
            <p className={`mr-auto text-[15px] leading-snug break-words whitespace-pre-wrap text-ink ${isMedia ? 'pt-1.5' : ''}`}>{caption}</p>
          )}
          <span className="ml-auto flex shrink-0 translate-y-0.5 items-center gap-1 text-[11px] text-ink-faint">
            {formatTime(message.createdAt)}
            {outgoing && <DeliveryTicks status={message.status} local={message.local} className="size-4" />}
          </span>
        </div>
        {message.local === 'failed' && (
          <button
            type="button"
            onClick={() => onRetry(message.clientId)}
            className="mt-1 flex items-center gap-1 text-xs font-semibold text-teal-800 dark:text-teal-200"
          >
            <RotateCcw className="size-3.5" /> No se envió. Toca para reintentar
          </button>
        )}
      </div>
    </div>
  );
}
