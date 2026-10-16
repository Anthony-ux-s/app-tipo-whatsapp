import type { ConversationSummary } from '@parla/types';
import { ChevronDown, ListChecks, Lock, Plus, X } from 'lucide-react';
import { Button, IconButton } from '@shared/ui/Button';
import { FieldError } from '@shared/ui/Field';
import { EmptyState, ErrorState, ListSkeleton } from '@shared/ui/States';
import { TaskCard } from '@shared/ui/TaskCard';
import { TeamIllustration } from '@shared/ui/illustrations';
import { useTasksPanel } from '../hooks/use-tasks-panel.hook';
import type { TaskPrefill } from '../types/tasks.types';

interface TasksPanelProps {
  conversation: ConversationSummary;
  prefill: TaskPrefill | null;
  onClose: () => void;
}

const inputClass =
  'h-11 w-full rounded-[var(--radius-card)] border border-line bg-surface px-3 text-[15px] text-ink outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/15';

/** Tareas del chat (panel lateral): crear, asignar, completar. */
export function TasksPanel({ conversation, prefill, onClose }: TasksPanelProps) {
  const panel = useTasksPanel(conversation, prefill);
  return (
    <aside aria-label="Tareas del chat" className="absolute inset-0 z-20 flex animate-slide-in flex-col bg-canvas lg:static lg:w-[380px] lg:shrink-0 lg:border-l lg:border-line">
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-line bg-surface px-2">
        <IconButton label="Cerrar tareas" onClick={onClose}>
          <X className="size-5" />
        </IconButton>
        <h2 className="flex-1 font-display text-base font-bold text-ink">Tareas</h2>
        {!panel.formOpen && (
          <Button size="sm" icon={<Plus className="size-4" />} onClick={panel.openForm}>
            Nueva
          </Button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-3 md:p-4">
        {panel.formOpen && (
          <form onSubmit={panel.submit} className="mb-4 flex animate-rise flex-col gap-3 rounded-2xl bg-surface p-4 shadow-float" noValidate>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink">¿Qué hay que hacer?</span>
              <textarea
                value={panel.title}
                onChange={(e) => panel.onTitleChange(e.target.value)}
                rows={2}
                autoFocus
                placeholder="ej. Enviar la cotización a los hoteles"
                className={`${inputClass} h-auto resize-none py-2.5`}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">Responsable</span>
                <select value={panel.assigneeId} onChange={(e) => panel.onAssigneeChange(e.target.value)} className={inputClass} aria-label="Responsable">
                  <option value="">Sin asignar</option>
                  {panel.assignees.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">Fecha límite</span>
                <input type="date" min={panel.minDate} value={panel.dueDate} onChange={(e) => panel.onDueDateChange(e.target.value)} className={inputClass} aria-label="Fecha límite" />
              </label>
            </div>
            {panel.fromMessage && <p className="text-xs text-ink-soft">Se enlazará con el mensaje del que sale.</p>}
            {panel.error && <FieldError message={panel.error} />}
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1 text-[11px] text-ink-faint">
                <Lock className="size-3" /> Título cifrado de extremo a extremo
              </span>
              <span className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={panel.closeForm}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" loading={panel.saving}>
                  Crear tarea
                </Button>
              </span>
            </div>
          </form>
        )}

        {panel.status === 'loading' && panel.open.length === 0 ? (
          <ListSkeleton rows={4} />
        ) : panel.status === 'error' ? (
          <ErrorState message="No pudimos traer las tareas." onRetry={panel.reload} />
        ) : panel.open.length === 0 && panel.done.length === 0 && !panel.formOpen ? (
          <EmptyState
            compact
            illustration={<TeamIllustration />}
            title="Sin tareas todavía"
            description="Convierte un mensaje en tarea o crea una nueva, asígnala a alguien del chat y ponle fecha."
            action={
              <Button icon={<ListChecks className="size-4" />} onClick={panel.openForm}>
                Crear la primera tarea
              </Button>
            }
          />
        ) : (
          <>
            <p className="mb-2 text-xs font-semibold tracking-wide text-ink-faint uppercase">Pendientes · {panel.open.length}</p>
            <div className="flex flex-col gap-2" data-testid="open-tasks">
              {panel.open.map((v) => (
                <TaskCard key={v.task.id} title={v.title} done={v.done} assignee={v.assignee} due={v.due} canToggle={v.canToggle} onToggle={() => panel.toggleTask(v.task)} />
              ))}
              {panel.open.length === 0 && <p className="py-3 text-center text-sm text-ink-soft">Todo al día 🎉</p>}
            </div>
            {panel.done.length > 0 && (
              <>
                <button type="button" onClick={panel.toggleDone} className="mt-5 mb-2 flex items-center gap-1 text-xs font-semibold tracking-wide text-ink-faint uppercase hover:text-ink">
                  Hechas · {panel.done.length}
                  <ChevronDown className={`size-4 transition-transform duration-200 ${panel.showDone ? 'rotate-180' : ''}`} />
                </button>
                {panel.showDone && (
                  <div className="flex animate-fade-in flex-col gap-2">
                    {panel.done.map((v) => (
                      <TaskCard key={v.task.id} title={v.title} done={v.done} assignee={v.assignee} due={v.due} canToggle={v.canToggle} onToggle={() => panel.toggleTask(v.task)} />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
