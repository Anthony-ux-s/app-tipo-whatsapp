import { CalendarClock, Check } from 'lucide-react';
import type { DueTone } from '../utils/date';
import { Avatar } from './Avatar';

interface TaskCardProps {
  title: string;
  done: boolean;
  assignee: { name: string; label: string; color: string } | null;
  due: { label: string; tone: DueTone } | null;
  /** Texto pequeño arriba (p. ej. el chat de origen en "Mis tareas"). */
  context?: string;
  canToggle: boolean;
  onToggle: () => void;
  onOpen?: () => void;
  variant?: 'bubble' | 'row';
}

const DUE_TONES: Record<DueTone, string> = {
  overdue: 'bg-teal-950 text-white dark:bg-teal-200 dark:text-teal-950',
  today: 'bg-cyan-100 text-cyan-900 dark:bg-cyan-900/60 dark:text-cyan-100',
  soon: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100',
  later: 'bg-surface-3 text-ink-soft',
  done: 'bg-surface-3 text-ink-faint',
};

/** Tarea con casilla para completarla, persona asignada y fecha límite. */
export function TaskCard({ title, done, assignee, due, context, canToggle, onToggle, onOpen, variant = 'row' }: TaskCardProps) {
  return (
    <div
      data-testid="task-card"
      data-done={done}
      className={`flex items-start gap-3 ${variant === 'bubble' ? 'min-w-[240px] max-w-[320px] py-1' : 'rounded-xl border border-line bg-surface p-3 transition-colors duration-200 hover:border-teal-300'}`}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Reabrir: ${title}` : `Marcar como hecha: ${title}`}
        disabled={!canToggle}
        onClick={onToggle}
        className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-teal-500 hover:bg-teal-50 dark:hover:bg-teal-950'}`}
      >
        {done && <Check className="size-4 animate-pop" strokeWidth={3} />}
      </button>
      <button type="button" onClick={onOpen} disabled={!onOpen} className="min-w-0 flex-1 text-left disabled:cursor-default">
        {context && <span className="mb-0.5 block truncate text-[11px] font-semibold tracking-wide text-ink-faint uppercase">{context}</span>}
        <span className={`block text-[15px] leading-snug font-medium break-words ${done ? 'text-ink-faint line-through' : 'text-ink'}`}>{title}</span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {assignee ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
              <Avatar name={assignee.name} color={assignee.color} size="xs" />
              {assignee.label}
            </span>
          ) : (
            <span className="text-xs text-ink-faint">Sin asignar</span>
          )}
          {due && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${DUE_TONES[due.tone]}`}>
              <CalendarClock className="size-3" /> {due.label}
            </span>
          )}
        </span>
      </button>
    </div>
  );
}
