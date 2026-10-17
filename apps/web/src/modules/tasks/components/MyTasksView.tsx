import { ArrowLeft, ListChecks } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState, ErrorState, ListSkeleton } from '@shared/ui/States';
import { TaskCard } from '@shared/ui/TaskCard';
import { TeamIllustration } from '@shared/ui/illustrations';
import { useMyTasks } from '../hooks/use-my-tasks.hook';

/** Todas mis tareas, de todos los chats. */
export function MyTasksView() {
  const mine = useMyTasks();
  return (
    <div className="flex-1 overflow-y-auto bg-canvas">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-3 sm:p-4 md:gap-6 md:p-6 lg:p-8">
        {/* En el celular las tareas se abren desde Ajustes (el avatar del encabezado). */}
        <Link to="/app/ajustes" className="-mb-2 inline-flex items-center gap-1.5 self-start rounded-full px-2 py-1 text-sm font-semibold text-ink-soft hover:bg-surface-3 hover:text-ink md:hidden">
          <ArrowLeft className="size-4" /> Ajustes
        </Link>
        <header className="flex items-center gap-4 rounded-2xl bg-gradient-to-br from-teal-700 to-cyan-800 p-5 text-white shadow-float md:p-6">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-white/15">
            <ListChecks className="size-6" />
          </span>
          <div>
            <h1 className="text-xl font-extrabold md:text-2xl">Mis tareas</h1>
            <p className="text-sm text-teal-100">Lo que te asignaron y lo que pediste, en todos tus chats.</p>
          </div>
        </header>

        <div className="flex gap-1.5 overflow-x-auto" role="tablist" aria-label="Filtrar tareas">
          {mine.scopes.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={mine.scope === s.id}
              onClick={() => mine.selectScope(s.id)}
              className={`h-9 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors duration-200 ${mine.scope === s.id ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200' : 'bg-surface text-ink-soft shadow-float hover:text-ink'}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <section className="flex flex-col gap-2" data-testid="my-tasks">
          {mine.status === 'loading' && mine.items.length === 0 ? (
            <ListSkeleton rows={4} />
          ) : mine.status === 'error' ? (
            <ErrorState message="No pudimos traer tus tareas." onRetry={mine.retry} />
          ) : mine.items.length === 0 ? (
            <EmptyState compact illustration={<TeamIllustration />} title="Nada por aquí" description={mine.emptyText} />
          ) : (
            mine.items.map(({ view, conversationTitle }) => (
              <TaskCard
                key={view.task.id}
                title={view.title}
                done={view.done}
                assignee={view.assignee}
                due={view.due}
                context={conversationTitle}
                canToggle={view.canToggle}
                onToggle={() => mine.toggle(view.task)}
                onOpen={() => mine.openInChat(view.task)}
              />
            ))
          )}
        </section>
      </div>
    </div>
  );
}
