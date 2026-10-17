import type { ConversationSummary } from '@parla/types';
import { ChevronDown, Copy, Download, Lock, MessageSquareReply, MessagesSquare, Reply, RotateCcw, Sparkles } from 'lucide-react';
import type { ChatMessage, DecryptedText } from '@shared/types/chat.types';
import { useChatStore } from '@shared/stores/chat.store';
import { useEffectsStore } from '@shared/stores/effects.store';
import { detectEffect } from '@shared/utils/chat-effects';
import { formatTime } from '@shared/utils/date';
import { stickerEffect } from '@shared/utils/sticker-codec';
import { Sticker } from '../../stickers/components/Sticker';
import { pluralize } from '@shared/utils/text';
import type { MessageActions } from '../types/message-actions.types';
import { DeliveryTicks } from './DeliveryTicks';
import { MediaContent } from './MediaContent';
import { MessageText } from './MessageText';
import { ReplyQuote } from './ReplyQuote';

interface MessageBubbleProps {
  conversation: ConversationSummary;
  message: ChatMessage;
  texts: Record<string, DecryptedText>;
  myId: string;
  outgoing: boolean;
  firstOfRun: boolean;
  lastOfRun: boolean;
  showSender: boolean;
  actions: MessageActions;
  /** Dentro del panel del hilo no se muestran la cita ni el contador de respuestas. */
  inThread?: boolean;
}

const NAME_COLORS: Record<string, string> = {
  teal: 'text-teal-600 dark:text-teal-300',
  emerald: 'text-emerald-600 dark:text-emerald-300',
  cyan: 'text-cyan-600 dark:text-cyan-300',
  'teal-dark': 'text-teal-800 dark:text-teal-200',
  'emerald-dark': 'text-emerald-800 dark:text-emerald-200',
  'cyan-dark': 'text-cyan-800 dark:text-cyan-200',
};

const menuItem = 'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-ink hover:bg-surface-2';

/** Sticker descifrado; al tocarlo se repite su efecto (si tiene). */
function MessageSticker({ clientId }: { clientId: string }) {
  const sticker = useChatStore((s) => s.stickers[clientId]);
  const effect = stickerEffect(sticker ?? null);
  const art = <Sticker sticker={sticker} className="size-36 md:size-40" />;
  if (!effect) return <div data-testid="sticker">{art}</div>;
  return (
    <button type="button" data-testid="sticker" onClick={() => useEffectsStore.getState().play(effect)} aria-label="Repetir efecto del sticker" className="block">
      {art}
    </button>
  );
}

export function MessageBubble({
  conversation,
  message,
  texts,
  myId,
  outgoing,
  firstOfRun,
  lastOfRun,
  showSender,
  actions,
  inThread = false,
}: MessageBubbleProps) {
  if (message.kind === 'system') {
    return (
      <div className="my-2 flex justify-center px-4">
        <span className="rounded-lg bg-surface/90 px-3 py-1.5 text-center text-xs text-ink-soft shadow-float">{message.systemText}</span>
      </div>
    );
  }

  const text = texts[message.clientId];
  const sender = actions.person(message.senderId);
  const isMedia = (message.kind === 'image' || message.kind === 'audio' || message.kind === 'video') && message.media;
  const isSticker = message.kind === 'sticker';
  const caption = text?.ok && !isSticker ? text.text : '';
  const effect = message.kind === 'text' && caption ? detectEffect(caption) : null;
  const mentionsMe = !outgoing && message.mentions.includes(myId);
  const mentioned = message.mentions.map((id) => ({ id, displayName: conversation.participants.find((p) => p.user.id === id)?.user.displayName ?? '' }));
  const canAct = !message.local;
  const tail = firstOfRun ? (outgoing ? 'rounded-tr-[4px]' : 'rounded-tl-[4px]') : '';

  return (
    <div className={`group flex px-3 md:px-[6%] ${outgoing ? 'justify-end' : 'justify-start'} ${firstOfRun ? 'mt-2' : 'mt-0.5'} ${lastOfRun ? 'mb-0.5' : ''}`}>
      <div
        data-testid="message"
        data-status={message.status}
        data-kind={message.kind}
        className={`relative max-w-[85%] animate-rise rounded-[var(--radius-bubble)] md:max-w-[65%] ${isSticker ? 'pr-8' : `shadow-float ${tail} ${outgoing ? 'bg-bubble-out' : 'bg-bubble-in'}`} ${isSticker ? '' : isMedia ? 'p-1' : `pt-1.5 pb-1.5 pl-3 ${canAct ? 'pr-9 md:pr-3' : 'pr-3'}`} ${mentionsMe ? 'ring-2 ring-cyan-400/70' : ''}`}
      >
        {canAct && (
          <button
            type="button"
            aria-label="Opciones del mensaje"
            aria-expanded={actions.menuFor === message.clientId}
            onClick={() => actions.toggleMenu(message.clientId)}
            className={`absolute top-1 right-1 z-[2] flex size-7 items-center justify-center rounded-full text-ink-soft transition-opacity duration-200 hover:bg-black/5 dark:hover:bg-white/10 ${actions.menuFor === message.clientId ? 'opacity-100' : 'opacity-60 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100'} ${outgoing ? 'bg-bubble-out' : 'bg-bubble-in'}`}
          >
            <ChevronDown className="size-4" />
          </button>
        )}
        {actions.menuFor === message.clientId && (
          <div role="menu" className={`absolute top-8 z-30 w-52 animate-pop overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-pop ${outgoing ? 'right-1' : 'left-auto right-1 md:left-full md:right-auto md:ml-1'}`}>
            <button role="menuitem" type="button" className={menuItem} onClick={() => actions.reply(message)}>
              <Reply className="size-4 text-ink-soft" /> Responder
            </button>
            {!inThread && (
              <button role="menuitem" type="button" className={menuItem} onClick={() => actions.openThread(message.replyTo?.id ?? message.id)}>
                <MessagesSquare className="size-4 text-ink-soft" /> Responder en hilo
              </button>
            )}
            {isMedia && (
              <button role="menuitem" type="button" className={menuItem} onClick={() => actions.download(message)}>
                <Download className="size-4 text-ink-soft" /> Descargar
              </button>
            )}
            {caption && (
              <button role="menuitem" type="button" className={menuItem} onClick={() => actions.copyText(message)}>
                <Copy className="size-4 text-ink-soft" /> Copiar texto
              </button>
            )}
          </div>
        )}

        {showSender && firstOfRun && !outgoing && (
          <p className={`pr-6 text-[13px] font-semibold ${NAME_COLORS[sender.color] ?? NAME_COLORS.teal} ${isMedia ? 'px-2 pt-1 pb-1' : ''}`}>{sender.name}</p>
        )}

        {message.replyTo && !inThread && (
          <div className={isMedia ? 'px-1 pt-1' : 'pr-5'}>
            <ReplyQuote
              reply={message.replyTo}
              author={actions.person(message.replyTo.senderId)}
              text={texts[message.replyTo.clientId]}
              onOpen={() => actions.openThread(message.replyTo!.id)}
            />
          </div>
        )}

        {isMedia && message.media && (
          <MediaContent
            conversation={conversation}
            kind={message.kind as 'image' | 'audio' | 'video'}
            media={message.media}
            localPreviewUrl={message.localPreviewUrl}
            outgoing={outgoing}
            onOpenImage={(url) => actions.openImage(url, message)}
          />
        )}
        {isSticker && <MessageSticker clientId={message.clientId} />}
        {message.kind === 'text' && !text && <p className="text-[15px] text-ink-faint italic">Descifrando…</p>}
        {text && !text.ok && (
          <p className="flex items-center gap-1.5 text-[14px] text-ink-soft italic">
            <Lock className="size-3.5" /> No se pudo descifrar este mensaje
          </p>
        )}
        <div className={`flex flex-wrap items-end justify-end gap-x-2 ${isMedia ? 'px-2 pb-1' : ''}`}>
          {caption && <MessageText text={caption} mentioned={mentioned} myId={myId} className={`mr-auto ${isMedia ? 'pt-1.5' : ''} ${canAct && !showSender && !message.replyTo ? 'pr-5' : ''}`} />}
          <span
            className={`ml-auto flex shrink-0 items-center gap-1 text-[11px] ${isSticker ? '-mt-1 rounded-full bg-black/45 px-1.5 py-0.5 text-white' : 'translate-y-0.5 text-ink-faint'}`}
          >
            {effect && (
              <button
                type="button"
                onClick={() => useEffectsStore.getState().play(effect)}
                aria-label="Repetir efecto"
                title="Repetir efecto"
                className="text-amber-500 transition-transform duration-150 hover:scale-125"
              >
                <Sparkles className="size-3.5" />
              </button>
            )}
            {formatTime(message.createdAt)}
            {outgoing && <DeliveryTicks status={message.status} local={message.local} className="size-4" />}
          </span>
        </div>

        {!inThread && message.replyCount > 0 && (
          <button
            type="button"
            onClick={() => actions.openThread(message.id)}
            data-testid="thread-chip"
            className={`mt-1 flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300 ${isMedia ? 'px-2 pb-1' : ''}`}
          >
            <MessageSquareReply className="size-3.5" /> {pluralize(message.replyCount, 'respuesta', 'respuestas')}
          </button>
        )}

        {message.local === 'failed' && (
          <button type="button" onClick={() => actions.retry(message.clientId)} className="mt-1 flex items-center gap-1 text-xs font-semibold text-teal-800 dark:text-teal-200">
            <RotateCcw className="size-3.5" /> No se envió. Toca para reintentar
          </button>
        )}
      </div>
    </div>
  );
}
