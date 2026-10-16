import { Link } from 'react-router';
import { Copy, Crown, MessageCircle, Pencil, RefreshCw, Search, Share2, ShieldCheck, UserMinus } from 'lucide-react';
import { Avatar } from '@shared/ui/Avatar';
import { Button, IconButton } from '@shared/ui/Button';
import { Field } from '@shared/ui/Field';
import { InviteIllustration } from '@shared/ui/illustrations';
import { ErrorState, ListSkeleton } from '@shared/ui/States';
import { Toggle } from '@shared/ui/Toggle';
import { WorkspaceBadge } from '@shared/ui/WorkspaceBadge';
import { formatLastSeen } from '@shared/utils/date';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '../const/workspaces.const';
import { useTeam } from '../hooks/use-team.hook';

/** Equipo: directorio de miembros y, para administradores, invitaciones, roles y ajustes. */
export function TeamView() {
  const team = useTeam();
  const detail = team.detail;

  if (team.error && !detail) return <div className="flex flex-1 items-center justify-center"><ErrorState message={team.error} onRetry={team.reload} /></div>;
  if (!detail) return <div className="flex-1 bg-surface"><ListSkeleton /></div>;

  return (
    <div className="flex-1 overflow-y-auto bg-canvas">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-3 sm:p-4 md:gap-6 md:p-6 lg:p-8">
        <section className="flex flex-col gap-4 rounded-2xl bg-surface p-4 shadow-float sm:flex-row sm:items-center md:p-6">
          <WorkspaceBadge name={detail.name} color={detail.color} />
          {team.editing ? (
            <div className="flex flex-1 flex-col gap-3">
              <Field label="Nombre" value={team.name} maxLength={60} onChange={(e) => team.onNameChange(e.target.value)} />
              <Field label="Descripción" value={team.description} maxLength={200} onChange={(e) => team.onDescriptionChange(e.target.value)} />
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={team.cancelEditing}>Cancelar</Button>
                <Button size="sm" loading={team.pending === 'details'} onClick={team.saveDetails}>Guardar</Button>
              </div>
            </div>
          ) : (
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-extrabold text-ink md:text-2xl">{detail.name}</h1>
              <p className="text-sm text-ink-soft">{detail.description || 'Sin descripción'}</p>
              <p className="mt-1 text-xs text-ink-faint">
                {detail.memberCount}
                {team.maxMembers ? ` de ${team.maxMembers}` : ''} miembros · {team.onlineCount} en línea · Tu rol: {ROLE_LABELS[detail.role]}
              </p>
              <Link
                to={`/app/w/${detail.id}/plan`}
                data-testid="plan-badge"
                className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-teal-600 to-emerald-600 px-3 py-1 text-xs font-bold text-white shadow-float hover:brightness-110"
              >
                <Crown className="size-3.5" /> Plan {team.planName}
                {team.isAdmin ? ' · Ver planes' : ''}
              </Link>
            </div>
          )}
          {team.isAdmin && !team.editing && (
            <Button variant="secondary" size="sm" icon={<Pencil className="size-4" />} onClick={team.startEditing}>
              Editar
            </Button>
          )}
        </section>

        {team.isAdmin && team.link && (
          <section className="grid gap-4 overflow-hidden rounded-2xl bg-gradient-to-br from-teal-700 to-cyan-800 p-4 text-white shadow-float sm:grid-cols-[1fr_160px] md:p-6">
            <div className="flex flex-col gap-3">
              <div>
                <h2 className="text-lg font-bold">Invita a tu equipo</h2>
                <p className="text-sm text-teal-100">Quien abra este enlace podrá unirse como colaborador.</p>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-white/10 p-1.5 pl-3 ring-1 ring-white/20">
                <code className="min-w-0 flex-1 truncate text-sm" data-testid="invite-link">{team.link}</code>
                <IconButton label="Copiar enlace" onClick={team.copyLink} className="text-white hover:bg-white/15 hover:text-white">
                  <Copy className="size-4" />
                </IconButton>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" className="!bg-white !text-teal-800 hover:!bg-teal-50" icon={<Share2 className="size-4" />} onClick={team.shareLink}>
                  Compartir
                </Button>
                <Button size="sm" variant="ghost" className="!text-teal-50 hover:!bg-white/10" icon={<RefreshCw className="size-4" />} loading={team.pending === 'invite'} onClick={team.regenerate}>
                  Renovar enlace
                </Button>
              </div>
            </div>
            <div className="hidden w-40 self-center sm:block">
              <InviteIllustration />
            </div>
          </section>
        )}

        {team.isAdmin && (
          <section className="rounded-2xl bg-surface p-4 shadow-float md:p-6">
            <h2 className="mb-2 flex items-center gap-2 text-base font-bold text-ink">
              <ShieldCheck className="size-5 text-brand dark:text-teal-300" /> Seguridad y permisos
            </h2>
            <Toggle
              checked={detail.allowMemberGroups}
              onChange={team.toggleMemberGroups}
              disabled={team.pending === 'groups'}
              label="Los colaboradores pueden crear grupos"
              description="Si lo desactivas, solo los administradores crean canales nuevos."
            />
          </section>
        )}

        <section className="rounded-2xl bg-surface shadow-float">
          <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center md:px-6">
            <h2 className="flex-1 text-base font-bold text-ink">Miembros</h2>
            <label className="relative flex items-center sm:w-64">
              <Search className="pointer-events-none absolute left-3 size-4 text-ink-faint" />
              <input
                type="search"
                value={team.search}
                onChange={(e) => team.onSearchChange(e.target.value)}
                placeholder="Buscar miembro"
                aria-label="Buscar miembro"
                className="h-9 w-full rounded-[var(--radius-card)] bg-surface-3 pl-9 text-sm text-ink outline-none focus:ring-2 focus:ring-teal-500/30"
              />
            </label>
          </div>
          <ul className="divide-y divide-line">
            {team.members.map((m) => {
              const isMe = m.user.id === team.user.id;
              return (
                <li key={m.memberId} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center md:px-6" data-testid="member-row">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar name={m.user.displayName} color={m.user.avatarColor} size="sm" online={m.user.presence === 'online'} />
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold text-ink">
                        {m.user.displayName} {isMe && <span className="font-normal text-ink-soft">(tú)</span>}
                      </p>
                      <p className="truncate text-xs text-ink-soft">
                        {m.user.username ? `@${m.user.username} · ` : ''}
                        {m.user.presence === 'online' ? 'en línea' : formatLastSeen(m.user.lastSeenAt)}
                      </p>
                    </div>
                  </div>

                  {team.removing === m.user.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-ink">¿Quitar del espacio?</span>
                      <Button size="sm" variant="ghost" onClick={team.cancelRemove}>No</Button>
                      <Button size="sm" variant="danger" loading={team.pending === `remove-${m.user.id}`} onClick={() => team.confirmRemove(m.user.id)}>
                        Sí, quitar
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 pl-12 sm:pl-0">
                      {team.isAdmin && !isMe ? (
                        <select
                          value={m.role}
                          onChange={(e) => team.changeRole(m.user.id, e.target.value as 'admin' | 'member')}
                          disabled={team.pending === `role-${m.user.id}`}
                          aria-label={`Rol de ${m.user.displayName}`}
                          title={ROLE_DESCRIPTIONS[m.role]}
                          className="h-9 rounded-[var(--radius-card)] border border-line bg-surface px-2 text-sm text-ink outline-none focus:ring-2 focus:ring-teal-500/30"
                        >
                          <option value="member">{ROLE_LABELS.member}</option>
                          <option value="admin">{ROLE_LABELS.admin}</option>
                        </select>
                      ) : (
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${m.role === 'admin' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200' : 'bg-surface-3 text-ink-soft'}`}
                        >
                          {ROLE_LABELS[m.role]}
                        </span>
                      )}
                      {!isMe && (
                        <IconButton label={`Escribir a ${m.user.displayName}`} onClick={() => team.message(m.user)} disabled={team.pending === `chat-${m.user.id}`}>
                          <MessageCircle className="size-5" />
                        </IconButton>
                      )}
                      {team.isAdmin && !isMe && (
                        <IconButton label={`Quitar a ${m.user.displayName}`} onClick={() => team.askRemove(m.user.id)}>
                          <UserMinus className="size-5" />
                        </IconButton>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
