import { RefreshCw } from 'lucide-react';
import { LogoMark } from './Logo';
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
      <LogoMark className="size-20" animated />
      <p className="text-sm font-medium text-ink-soft">{label}</p>
    </div>
  );
}
