import { AtSign, Mic, Paperclip, Reply, SendHorizontal, Smile, Square, Trash2, X } from 'lucide-react';
import { IconButton } from '@shared/ui/Button';
import { Spinner } from '@shared/ui/Spinner';
import { formatDuration } from '@shared/utils/date';
import { ACCEPTED_MEDIA } from '../const/chats.const';
import { useComposer } from '../hooks/use-composer.hook';
import { StickerPicker } from '../../stickers/components/StickerPicker';
import { AttachmentPreviewModal } from './AttachmentPreviewModal';

interface ComposerProps {
  conversationId: string;
  /** En el panel de un hilo, cada mensaje responde a esta raíz. */
  threadRootId?: string | null;
}

/** Barra inferior fija de escritura con @menciones, respuestas, adjuntos y notas de voz. */
export function Composer({ conversationId, threadRootId = null }: ComposerProps) {
  const composer = useComposer(conversationId, threadRootId);
  const recording = composer.recorder.state === 'recording';

  return (
    <div className="safe-bottom relative shrink-0 bg-surface-2 px-2 py-2 md:px-4 md:py-3">
      {composer.suggestions.length > 0 && (
        <ul
          role="listbox"
          aria-label="Mencionar a alguien"
          className="absolute bottom-full left-2 z-20 mb-2 w-72 max-w-[calc(100%-1rem)] animate-rise overflow-hidden rounded-2xl border border-line bg-surface py-1 shadow-pop md:left-4"
        >
          {composer.suggestions.map((candidate, index) => (
            <li key={candidate.id} role="option" aria-selected={index === composer.mentionIndex}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => composer.pickMention(candidate)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-ink ${index === composer.mentionIndex ? 'bg-teal-50 dark:bg-teal-950/60' : 'hover:bg-surface-2'}`}
              >
                <AtSign className="size-4 text-teal-600 dark:text-teal-300" />
                {candidate.displayName}
              </button>
            </li>
          ))}
        </ul>
      )}

      {composer.reply && (
        <div className="mb-2 flex animate-rise items-center gap-2 rounded-xl border-l-4 border-teal-500 bg-surface px-3 py-2 shadow-float" data-testid="reply-bar">
          <Reply className="size-4 shrink-0 text-teal-600 dark:text-teal-300" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-teal-700 dark:text-teal-300">Respondiendo a {composer.reply.author}</p>
            <p className="truncate text-sm text-ink-soft">{composer.reply.preview}</p>
          </div>
          <IconButton label="Cancelar respuesta" onClick={composer.cancelReply} className="size-8">
            <X className="size-4" />
          </IconButton>
        </div>
      )}
      {composer.emojiOpen && <StickerPicker emojis={composer.emojis} onEmoji={composer.addEmoji} onSticker={composer.sendSticker} />}

      {recording || composer.recorder.state === 'sending' ? (
        <div className="flex h-12 animate-fade-in items-center gap-2">
          <IconButton label="Descartar nota de voz" onClick={composer.recorder.cancel} disabled={!recording}>
            <Trash2 className="size-5" />
          </IconButton>
          <div className="flex flex-1 items-center gap-3 rounded-full bg-surface px-4 py-2.5 shadow-float">
            <span className="relative flex size-3">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-3 rounded-full bg-emerald-500" />
            </span>
            <span className="font-mono text-sm text-ink tabular-nums">{formatDuration(composer.recorder.elapsed)}</span>
            <span className="truncate text-sm text-ink-soft">{recording ? 'Grabando nota de voz…' : 'Cifrando y enviando…'}</span>
          </div>
          <button
            type="button"
            onClick={composer.recorder.stop}
            disabled={!recording}
            aria-label="Enviar nota de voz"
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand text-white shadow-float transition-transform duration-200 active:scale-95"
          >
            {recording ? <Square className="size-4" fill="currentColor" /> : <Spinner className="size-5" />}
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-1 md:gap-2">
          <IconButton label="Emojis y stickers" active={composer.emojiOpen} onClick={composer.toggleEmoji} className="mb-1">
            <Smile className="size-6" />
          </IconButton>
          <IconButton label="Adjuntar foto o video" onClick={composer.pickFile} className="mb-1">
            <Paperclip className="size-[22px]" />
          </IconButton>
          <input ref={composer.fileInput} type="file" accept={ACCEPTED_MEDIA} className="hidden" onChange={composer.onFileChange} data-testid="file-input" />
          <div className="flex min-h-12 flex-1 items-center rounded-3xl bg-surface px-4 py-2 shadow-float">
            <textarea
              ref={composer.textArea}
              rows={1}
              value={composer.text}
              onChange={composer.onTextChange}
              onKeyDown={composer.onKeyDown}
              onClick={composer.onCaretMove}
              onKeyUp={composer.onCaretMove}
              placeholder={threadRootId ? 'Responder en el hilo' : 'Escribe un mensaje · @ para mencionar'}
              aria-label={threadRootId ? 'Responder en el hilo' : 'Escribe un mensaje'}
              className="max-h-36 w-full resize-none bg-transparent chat-text leading-snug text-ink placeholder:text-ink-faint outline-none"
            />
          </div>
          {composer.canSend ? (
            <button
              type="button"
              onClick={composer.send}
              aria-label="Enviar mensaje"
              className="flex size-12 shrink-0 animate-pop items-center justify-center rounded-full bg-brand text-white shadow-float transition-all duration-200 hover:bg-brand-strong active:scale-95"
            >
              <SendHorizontal className="size-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={composer.recorder.start}
              aria-label="Grabar nota de voz"
              className="flex size-12 shrink-0 animate-pop items-center justify-center rounded-full bg-brand text-white shadow-float transition-all duration-200 hover:bg-brand-strong active:scale-95"
            >
              <Mic className="size-5" />
            </button>
          )}
        </div>
      )}

      <AttachmentPreviewModal
        attachment={composer.attachment}
        caption={composer.caption}
        sending={composer.sendingAttachment}
        onCaptionChange={composer.onCaptionChange}
        onClose={composer.closeAttachment}
        onSend={composer.sendAttachment}
      />
    </div>
  );
}
