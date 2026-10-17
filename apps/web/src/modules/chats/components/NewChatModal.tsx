import { Check, Lock, Search, Users } from 'lucide-react';
import { Avatar } from '@shared/ui/Avatar';
import { Button } from '@shared/ui/Button';
import { Field, FieldError } from '@shared/ui/Field';
import { Modal } from '@shared/ui/Modal';
import { ListSkeleton } from '@shared/ui/States';
import { formatLastSeen } from '@shared/utils/date';
import { useNewChat } from '../hooks/use-new-chat.hook';
import type { NewChatMode } from '../types/chats.types';

interface NewChatModalProps {
  mode: NewChatMode | null;
  onClose: () => void;
}

export function NewChatModal({ mode, onClose }: NewChatModalProps) {
  const chat = useNewChat(mode, onClose);
  const isGroup = chat.mode === 'group';
  return (
    <Modal
      open={mode !== null}
      onClose={onClose}
      title={isGroup ? 'Nuevo grupo' : 'Nuevo chat'}
      description={isGroup ? 'Crea un grupo con personas de Parla.' : 'Escribe en privado a cualquier persona de Parla.'}
      footer={
        isGroup ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={chat.submitGroup} loading={chat.busy} icon={<Users className="size-4" />}>
              Crear grupo{chat.selected.length > 0 ? ` (${chat.selected.length + 1})` : ''}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-[var(--radius-card)] bg-surface-3 p-1">
        {(['direct', 'group'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => chat.setMode(m)}
            className={`h-9 rounded-md text-sm font-semibold transition-all duration-200 ${chat.mode === m ? 'bg-surface text-ink shadow-float' : 'text-ink-soft'}`}
          >
            {m === 'direct' ? 'Persona' : 'Grupo'}
          </button>
        ))}
      </div>

      {isGroup && (
        <div className="mb-4 flex flex-col gap-3">
          <Field label="Nombre del grupo" placeholder="ej. Compras diciembre" value={chat.title} maxLength={60} onChange={(e) => chat.onTitleChange(e.target.value)} />
          {chat.selectedPeople.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {chat.selectedPeople.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => chat.pickPerson(p)}
                  className="flex animate-pop items-center gap-1.5 rounded-full bg-teal-100 py-1 pr-2.5 pl-1 text-xs font-semibold text-teal-900 dark:bg-teal-900/60 dark:text-teal-100"
                >
                  <Avatar name={p.displayName} color={p.avatarColor} size="xs" />
                  {p.displayName.split(' ')[0]} ✕
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <label className="relative mb-2 flex items-center">
        <Search className="pointer-events-none absolute left-3 size-4 text-ink-faint" />
        <input
          type="search"
          value={chat.search}
          onChange={(e) => chat.onSearchChange(e.target.value)}
          placeholder="Buscar por nombre, usuario o teléfono"
          aria-label="Buscar personas"
          className="h-10 w-full rounded-[var(--radius-card)] bg-surface-3 pl-9 text-sm text-ink outline-none focus:ring-2 focus:ring-teal-500/30"
        />
      </label>

      {(chat.error ?? chat.directoryError) && (
        <div className="mb-2">
          <FieldError message={(chat.error ?? chat.directoryError)!} />
        </div>
      )}

      {chat.loading ? (
        <ListSkeleton rows={4} />
      ) : chat.people.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-soft">No encontramos a nadie con ese nombre en Parla.</p>
      ) : (
        <ul className="-mx-2">
          {chat.people.map((person) => {
            const picked = chat.selected.includes(person.id);
            return (
              <li key={person.id}>
                <button
                  type="button"
                  disabled={chat.busy}
                  onClick={() => chat.pickPerson(person)}
                  className="flex w-full items-center gap-3 rounded-[var(--radius-card)] px-2 py-2 text-left transition-colors duration-200 hover:bg-surface-2 disabled:opacity-60"
                >
                  <Avatar name={person.displayName} color={person.avatarColor} size="sm" online={person.presence === 'online'} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-ink">{person.displayName}</span>
                    <span className="block truncate text-xs text-ink-soft">
                      {person.about || (person.presence === 'online' ? 'en línea' : formatLastSeen(person.lastSeenAt))}
                    </span>
                  </span>
                  {isGroup && (
                    <span
                      className={`flex size-6 items-center justify-center rounded-full border-2 transition-colors duration-200 ${picked ? 'border-brand bg-brand text-white' : 'border-line'}`}
                    >
                      {picked && <Check className="size-3.5" strokeWidth={3} />}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-ink-faint">
        <Lock className="size-3.5" /> Las claves del chat se crean en tu dispositivo.
      </p>
    </Modal>
  );
}
