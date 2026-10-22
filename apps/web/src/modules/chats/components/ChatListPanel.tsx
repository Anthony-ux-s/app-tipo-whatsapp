import { MessageSquarePlus, Search, X } from 'lucide-react';
import { Button } from '@shared/ui/Button';
import { ProfileButton } from '@shared/ui/ProfileButton';
import { EmptyChatsIllustration, NoResultsIllustration } from '@shared/ui/illustrations';
import { EmptyState, ErrorState, ListSkeleton } from '@shared/ui/States';
import { useChatList } from '../hooks/use-chat-list.hook';
import { ChatListItem } from './ChatListItem';

/** Barra lateral: menú y nuevo chat arriba, búsqueda, filtros y la lista de conversaciones. */
export function ChatListPanel() {
  const list = useChatList();
  return (
    <section className="flex min-h-0 flex-1 flex-col bg-surface" aria-label="Chats">
      <header className="flex items-center gap-2 px-3 pt-2 pb-1.5 md:px-4">
        <ProfileButton />
        <h1 className="min-w-0 flex-1 truncate px-1 font-display text-xl font-extrabold text-ink">Chats</h1>
        <button
          type="button"
          onClick={() => list.openNewChat('direct')}
          aria-label="Nuevo chat"
          title="Nuevo chat"
          className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-teal-400 to-brand text-white shadow-[0_2px_0_0_var(--color-brand-strong)] transition-all duration-150 hover:brightness-105 active:translate-y-0.5 active:shadow-none"
        >
          <MessageSquarePlus className="size-5" />
        </button>
      </header>

      <div className="px-3 pb-2 md:px-4">
        <label className="relative flex items-center">
          <Search className="pointer-events-none absolute left-3 size-4 text-ink-faint" />
          <input
            type="search"
            value={list.search}
            onChange={(e) => list.onSearchChange(e.target.value)}
            placeholder="Buscar un chat o una persona"
            aria-label="Buscar chats"
            className="h-10 w-full rounded-[var(--radius-card)] bg-surface-3 pr-9 pl-9 text-sm text-ink placeholder:text-ink-faint outline-none transition-all duration-200 focus:bg-surface focus:ring-2 focus:ring-teal-500/30"
          />
          {list.search && (
            <button type="button" onClick={list.clearSearch} aria-label="Limpiar búsqueda" className="absolute right-2.5 text-ink-faint hover:text-ink">
              <X className="size-4" />
            </button>
          )}
        </label>
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Filtrar chats">
          {list.filters.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={list.filter === f.id}
              onClick={() => list.selectFilter(f.id)}
              className={`h-8 shrink-0 rounded-full px-3 text-[13px] font-semibold transition-colors duration-200 ${list.filter === f.id ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200' : 'bg-surface-3 text-ink-soft hover:text-ink'}`}
            >
              {f.label}
              {f.id === 'unread' && list.totalUnread > 0 && ` · ${list.totalUnread}`}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {list.status === 'loading' || list.status === 'idle' ? (
          <ListSkeleton />
        ) : list.status === 'error' ? (
          <ErrorState message={list.error ?? 'No pudimos traer tus chats.'} onRetry={list.retry} />
        ) : !list.hasAnyConversation ? (
          <EmptyState
            compact
            illustration={<EmptyChatsIllustration />}
            title="¿No tienes chats aún?"
            description="Escríbele a cualquier persona de Parla o crea un grupo. Todo queda cifrado de extremo a extremo."
            action={
              <Button icon={<MessageSquarePlus className="size-4" />} onClick={() => list.openNewChat('direct')}>
                Iniciar una conversación
              </Button>
            }
          />
        ) : list.entries.length === 0 ? (
          <EmptyState
            compact
            illustration={<NoResultsIllustration />}
            title="Sin resultados"
            description={list.search ? `No hay chats que coincidan con «${list.search}».` : 'No hay chats en este filtro.'}
          />
        ) : (
          <ul className="pb-2" data-testid="chat-list">
            {list.entries.map((entry) => (
              <ChatListItem key={entry.conversation.id} entry={entry} active={entry.conversation.id === list.activeId} onOpen={list.openConversation} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
