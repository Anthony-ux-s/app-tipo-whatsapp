import { RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { ErrorIllustration } from './illustrations';
import { Button } from './Button';

interface EmptyStateProps {
  illustration: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  compact?: boolean;
}

/** Estado vacío: ilustración + texto claro + acción principal. */
export function EmptyState({ illustration, title, description, action, compact = false }: EmptyStateProps) {
  return (
    <div className={`flex animate-fade-in flex-col items-center text-center ${compact ? 'gap-3 px-6 py-10' : 'gap-4 px-6 py-16'}`}>
      <div className={compact ? 'w-36' : 'w-52 md:w-64'}>{illustration}</div>
      <div className="max-w-sm">
        <h3 className={`font-bold text-ink ${compact ? 'text-base' : 'text-lg md:text-xl'}`}>{title}</h3>
        <p className="mt-1.5 text-sm text-ink-soft md:text-[15px]">{description}</p>
      </div>
      {action}
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  compact?: boolean;
}

export function ErrorState({ message, onRetry, compact = true }: ErrorStateProps) {
  return (
    <EmptyState
      compact={compact}
      illustration={<ErrorIllustration />}
      title="No pudimos cargar esto"
      description={message}
      action={
        onRetry && (
          <Button variant="secondary" size="sm" icon={<RefreshCw className="size-4" />} onClick={onRetry}>
            Reintentar
          </Button>
        )
      }
    />
  );
}

export function ListSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <div className="flex flex-col" aria-label="Cargando" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3" style={{ opacity: 1 - i * 0.1 }}>
          <div className="skeleton size-12 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="skeleton h-3.5 w-2/5" />
            <div className="skeleton h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function FullScreenLoader({ label = 'Cargando Parla…' }: { label?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 bg-canvas">
      <div className="relative">
        <div className="absolute inset-0 animate-ping rounded-full bg-teal-400/20" />
        <svg viewBox="0 0 48 48" className="relative size-16" aria-hidden="true">
          <path d="M20 5h17a8 8 0 0 1 8 8v10a8 8 0 0 1-8 8h-1v6l-7-6h-9a8 8 0 0 1-8-8V13a8 8 0 0 1 8-8z" fill="#34d399" />
          <path d="M11 15h16a8 8 0 0 1 8 8v10a8 8 0 0 1-8 8H17l-8 6v-6.4A8 8 0 0 1 3 33V23a8 8 0 0 1 8-8z" fill="#009d71" />
          <path d="M12.5 28.5l4.5 4.5 8.5-9" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <p className="text-sm font-medium text-ink-soft">{label}</p>
    </div>
  );
}
