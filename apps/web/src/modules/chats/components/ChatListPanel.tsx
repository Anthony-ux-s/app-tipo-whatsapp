import { ChevronDown, MessageSquarePlus, Search, Users, X } from 'lucide-react';
import { Avatar } from '@shared/ui/Avatar';
import { Button, IconButton } from '@shared/ui/Button';
import { EmptyChatsIllustration, NoResultsIllustration } from '@shared/ui/illustrations';
import { EmptyState, ErrorState, ListSkeleton } from '@shared/ui/States';
import { WorkspaceBadge } from '@shared/ui/WorkspaceBadge';
import { useChatList } from '../hooks/use-chat-list.hook';
import { ChatListItem } from './ChatListItem';
import { NewChatModal } from './NewChatModal';

/** Barra lateral: perfil y espacio, nuevo chat, búsqueda, filtros y la lista de conversaciones. */
export function ChatListPanel() {
  const list = useChatList();
  return (
    <section className="flex min-h-0 flex-1 flex-col bg-surface" aria-label="Chats">
      <header className="flex items-center gap-2 px-3 pt-3 pb-2 md:px-4">
        <button
          type="button"
          onClick={list.toggleSwitcher}
          aria-expanded={list.switcherOpen}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-1 text-left transition-colors duration-200 hover:bg-surface-2"
        >
          <span className="md:hidden">
            <Avatar name={list.user.displayName} color={list.user.avatarColor} size="sm" />
          </span>
          {list.workspace && (
            <span className="hidden md:inline-flex">
              <WorkspaceBadge name={list.workspace.name} color={list.workspace.color} size="sm" />
            </span>
          )}
          <span className="min-w-0">
            <span className="flex items-center gap-1">
              <span className="truncate font-display text-lg font-extrabold text-ink">{list.workspace?.name ?? 'Chats'}</span>
              <ChevronDown className={`size-4 shrink-0 text-ink-soft transition-transform duration-200 ${list.switcherOpen ? 'rotate-180' : ''}`} />
            </span>
            <span className="block truncate text-xs text-ink-soft">
              {list.user.displayName} · {list.workspace?.role === 'admin' ? 'Administrador' : 'Colaborador'}
            </span>
          </span>
        </button>
        <IconButton label="Nuevo grupo" onClick={() => list.openNewChat('group')}>
          <Users className="size-5" />
        </IconButton>
        <IconButton label="Nuevo chat" onClick={() => list.openNewChat('direct')} className="bg-brand text-white hover:bg-brand-strong hover:text-white">
          <MessageSquarePlus className="size-5" />
        </IconButton>
      </header>

      {list.switcherOpen && (
        <div className="mx-3 mb-2 animate-rise overflow-hidden rounded-xl border border-line bg-surface shadow-pop md:mx-4">
          <p className="px-3 pt-3 pb-1 text-xs font-semibold tracking-wide text-ink-faint uppercase">Tus espacios</p>
          <ul>
            {list.workspaces.map((ws) => (
              <li key={ws.id}>
                <button
                  type="button"
                  onClick={() => list.switchWorkspace(ws.id)}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2 ${ws.id === list.workspace?.id ? 'bg-teal-50 dark:bg-teal-950/40' : ''}`}
                >
                  <WorkspaceBadge name={ws.name} color={ws.color} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{ws.name}</span>
                    <span className="block text-xs text-ink-soft">
                      {ws.memberCount} miembros · {ws.role === 'admin' ? 'Administrador' : 'Colaborador'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

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
            description="Inicia una nueva conversación con alguien de tu equipo. Todo queda cifrado de extremo a extremo."
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

      <NewChatModal mode={list.newChat} onClose={list.closeNewChat} />
    </section>
  );
}
