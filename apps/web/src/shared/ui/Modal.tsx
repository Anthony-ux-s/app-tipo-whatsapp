import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { IconButton } from './Button';

interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md';
}

/** Diálogo centrado en escritorio y hoja inferior en el celular. */
export function Modal({ open, title, description, onClose, children, footer, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 animate-fade-in bg-teal-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={`relative flex max-h-[92dvh] w-full animate-rise flex-col overflow-hidden rounded-t-2xl bg-surface shadow-pop sm:animate-pop sm:rounded-2xl ${size === 'sm' ? 'sm:max-w-md' : 'sm:max-w-lg'}`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 pt-5 pb-4 sm:px-6">
          <div>
            <h2 className="text-lg font-bold text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-ink-soft">{description}</p>}
          </div>
          <IconButton label="Cerrar" onClick={onClose} className="-mt-1 -mr-2">
            <X className="size-5" />
          </IconButton>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">{children}</div>
        {footer && <footer className="safe-bottom flex justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3 sm:px-6">{footer}</footer>}
      </div>
    </div>
  );
}
