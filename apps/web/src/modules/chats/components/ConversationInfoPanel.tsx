import type { ConversationSummary } from '@parla/types';
import { Check, LogOut, ShieldCheck, UserPlus, X } from 'lucide-react';
import { Avatar } from '@shared/ui/Avatar';
import { Button, IconButton } from '@shared/ui/Button';
import { formatLastSeen } from '@shared/utils/date';
import { pluralize } from '@shared/utils/text';
import { useConversationInfo } from '../hooks/use-conversation-info.hook';

interface ConversationInfoPanelProps {
  conversation: ConversationSummary;
  open: boolean;
  onClose: () => void;
}

/** Panel lateral (escritorio) o pantalla completa (celular) con los datos del chat. */
export function ConversationInfoPanel({ conversation, open, onClose }: ConversationInfoPanelProps) {
  const info = useConversationInfo(conversation, open);
  if (!open) return null;
  return (
    <aside
      aria-label="Información del chat"
      className="absolute inset-0 z-20 flex animate-slide-in flex-col bg-canvas lg:static lg:w-[360px] lg:shrink-0 lg:border-l lg:border-line"
    >
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-line bg-surface px-2">
        <IconButton label="Cerrar información" onClick={onClose}>
          <X className="size-5" />
        </IconButton>
        <h2 className="font-display text-base font-bold text-ink">{info.isGroup ? 'Info. del grupo' : 'Info. del contacto'}</h2>
      </header>

      <div className="flex-1 overflow-y-auto">
        <section className="flex flex-col items-center gap-2 bg-surface px-6 py-7 text-center">
          <Avatar name={conversation.title} color={conversation.avatarColor} group={info.isGroup} size="xl" />
          <h3 className="mt-2 text-xl font-bold text-ink">{conversation.title}</h3>
          <p className="text-sm text-ink-soft">
            {info.isGroup
              ? `Grupo · ${pluralize(conversation.participants.length, 'miembro', 'miembros')}`
              : info.other?.username
                ? `@${info.other.username}`
                : info.other?.presence === 'online'
                  ? 'en línea'
                  : formatLastSeen(info.other?.lastSeenAt ?? null)}
          </p>
          {conversation.description && <p className="mt-1 max-w-xs text-sm text-ink">{conversation.description}</p>}
        </section>

        <section className="mt-2 bg-surface px-5 py-4">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div>
              <h4 className="text-[15px] font-semibold text-ink">Cifrado de extremo a extremo</h4>
              <p className="mt-0.5 text-sm text-ink-soft">
                Los mensajes, fotos y notas de voz se cifran en tu dispositivo. Ni Parla ni nadie fuera de este chat puede leerlos.
              </p>
            </div>
          </div>
          {info.fingerprint && (
            <div className="mt-4 rounded-[var(--radius-card)] bg-surface-2 p-3">
              <p className="text-xs font-semibold text-ink-soft">Huella de seguridad de {info.other?.displayName.split(' ')[0]}</p>
              <p className="mt-2 grid grid-cols-4 gap-x-3 gap-y-1 font-mono text-[13px] text-ink">
                {info.fingerprint.map((group, i) => (
                  <span key={i}>{group}</span>
                ))}
              </p>
              <p className="mt-2 text-[11px] text-ink-faint">Compárala en persona para verificar que nadie se interpuso.</p>
            </div>
          )}
        </section>

        {info.isGroup && (
          <section className="mt-2 bg-surface py-3">
            <div className="flex items-center justify-between px-5 pb-2">
              <h4 className="text-sm font-semibold text-ink-soft">{pluralize(conversation.participants.length, 'miembro', 'miembros')}</h4>
              {info.canAdd && !info.adding && (
                <Button variant="ghost" size="sm" icon={<UserPlus className="size-4" />} onClick={info.startAdding}>
                  Agregar
                </Button>
              )}
            </div>

            {info.adding && (
              <div className="mx-4 mb-3 animate-rise rounded-xl border border-line p-2">
                {info.candidates.length === 0 ? (
                  <p className="p-3 text-center text-sm text-ink-soft">Todas las personas del espacio ya están en el grupo.</p>
                ) : (
                  <ul className="max-h-56 overflow-y-auto">
                    {info.candidates.map((c) => {
                      const picked = info.selected.includes(c.id);
                      return (
                        <li key={c.id}>
                          <button type="button" onClick={() => info.toggleCandidate(c.id)} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                            <Avatar name={c.displayName} color={c.avatarColor} size="xs" />
                            <span className="flex-1 truncate text-left text-sm text-ink">{c.displayName}</span>
                            <span className={`flex size-5 items-center justify-center rounded-full border-2 ${picked ? 'border-brand bg-brand text-white' : 'border-line'}`}>
                              {picked && <Check className="size-3" strokeWidth={3} />}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="mt-2 flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={info.cancelAdding}>
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={info.confirmAdd} loading={info.busy} disabled={info.selected.length === 0}>
                    Agregar {info.selected.length > 0 ? `(${info.selected.length})` : ''}
                  </Button>
                </div>
              </div>
            )}

            <ul>
              {info.members.map((p) => (
                <li key={p.user.id} className="flex items-center gap-3 px-5 py-2">
                  <Avatar name={p.user.displayName} color={p.user.avatarColor} size="sm" online={p.user.presence === 'online'} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-ink">
                      {p.user.id === info.user.id ? 'Tú' : p.user.displayName}
                    </span>
                    <span className="block truncate text-xs text-ink-soft">{p.user.about || (p.user.username ? `@${p.user.username}` : '')}</span>
                  </span>
                  {p.role === 'admin' && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
                      Admin
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {info.isGroup && (
          <section className="mt-2 mb-6 bg-surface px-5 py-4">
            {info.confirmLeave ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-ink">¿Salir de «{conversation.title}»? Dejarás de recibir sus mensajes.</p>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={info.cancelLeave}>
                    Cancelar
                  </Button>
                  <Button variant="danger" size="sm" icon={<LogOut className="size-4" />} loading={info.busy} onClick={info.leaveGroup}>
                    Salir del grupo
                  </Button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={info.askLeave} className="flex items-center gap-3 text-[15px] font-semibold text-teal-900 dark:text-teal-200">
                <LogOut className="size-5" /> Salir del grupo
              </button>
            )}
          </section>
        )}
      </div>
    </aside>
  );
}
