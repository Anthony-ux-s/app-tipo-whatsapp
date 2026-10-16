import { Lock, SendHorizontal } from 'lucide-react';
import { Button } from '@shared/ui/Button';
import { Modal } from '@shared/ui/Modal';
import { formatBytes } from '@shared/utils/text';
import type { PendingAttachment } from '../types/chats.types';

interface AttachmentPreviewModalProps {
  attachment: PendingAttachment | null;
  caption: string;
  sending: boolean;
  onCaptionChange: (value: string) => void;
  onClose: () => void;
  onSend: () => void;
}

export function AttachmentPreviewModal({ attachment, caption, sending, onCaptionChange, onClose, onSend }: AttachmentPreviewModalProps) {
  return (
    <Modal
      open={attachment !== null}
      onClose={onClose}
      title={attachment?.kind === 'video' ? 'Enviar video' : 'Enviar foto'}
      description={attachment ? `${attachment.file.name} · ${formatBytes(attachment.file.size)}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onSend} loading={sending} icon={<SendHorizontal className="size-4" />}>
            Enviar
          </Button>
        </>
      }
    >
      {attachment && (
        <div className="flex flex-col gap-4">
          <div className="flex max-h-[50dvh] items-center justify-center overflow-hidden rounded-xl bg-surface-3">
            {attachment.kind === 'video' ? (
              <video src={attachment.previewUrl} controls className="max-h-[50dvh] w-full" />
            ) : (
              <img src={attachment.previewUrl} alt="Vista previa" className="max-h-[50dvh] object-contain" />
            )}
          </div>
          <input
            value={caption}
            onChange={(e) => onCaptionChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSend()}
            placeholder="Añade un comentario…"
            aria-label="Comentario"
            maxLength={1000}
            className="h-11 rounded-[var(--radius-card)] border border-line bg-surface px-3.5 text-[15px] text-ink outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/15"
          />
          <p className="flex items-center gap-1.5 text-xs text-ink-faint">
            <Lock className="size-3.5" /> El archivo se cifra en tu dispositivo antes de subirse.
          </p>
        </div>
      )}
    </Modal>
  );
}
