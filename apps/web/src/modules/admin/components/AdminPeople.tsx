import type { AdminPeopleFilter, AdminPerson, PersonRole } from '@parla/types';
import { Ban, Search, ShieldCheck } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from '@shared/stores/toast.store';
import { Avatar } from '@shared/ui/Avatar';
import { Button } from '@shared/ui/Button';
import { TextAreaField } from '@shared/ui/Field';
import { Modal } from '@shared/ui/Modal';
import { EmptyState, ErrorState, ListSkeleton } from '@shared/ui/States';
import { NoResultsIllustration } from '@shared/ui/illustrations';
import { formatLastSeen } from '@shared/utils/date';
import { errorMessage, http } from '@shared/utils/http';
import { formatLongDate } from '@shared/utils/money';
import { useAdminList } from '../hooks/use-admin.hook';

const FILTERS: { id: AdminPeopleFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'clients', label: 'Clientes' },
  { id: 'drivers', label: 'Repartidores' },
  { id: 'businesses', label: 'Negocios' },
  { id: 'blocked', label: 'Suspendidos' },
];

const ROLE_LABEL: Record<PersonRole, string> = { client: 'Cliente', driver: 'Repartidor', business: 'Negocio', admin: 'Soporte' };
const DRIVER_STATUS: Record<string, string> = { pending: 'por verificar', approved: 'verificado', rejected: 'rechazado' };

/**
 * Soporte: todas las personas que entran a Parla (clientes, repartidores y negocios), cuánto usan la
 * app y suspender o reactivar cuentas.
 */
export function AdminPeople({ chip }: { chip: (on: boolean, onClick: () => void, label: string) => ReactNode }) {
  const [filter, setFilter] = useState<AdminPeopleFilter>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const list = useAdminList<AdminPerson>(`/admin/people?filter=${filter}&q=${encodeURIComponent(query)}`);
  const [suspending, setSuspending] = useState<AdminPerson | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const setBlocked = async (person: AdminPerson, blocked: boolean, reason = '') => {
    setBusy(person.id);
    try {
      await http.post<AdminPerson>(`/admin/people/${encodeURIComponent(person.id)}/blocked`, { blocked, reason });
      toast(blocked ? `${person.displayName} quedó suspendido` : `${person.displayName} puede volver a entrar`, 'success');
      list.reload();
      return true;
    } catch (err) {
      toast(errorMessage(err), 'error');
      return false;
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-3" data-testid="admin-people">
      <form
        className="relative flex items-center"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(search.trim());
        }}
      >
        <Search className="pointer-events-none absolute left-3 size-4 text-ink-faint" />
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!e.target.value) setQuery('');
          }}
          placeholder="Buscar por nombre, @usuario o teléfono (Enter)"
          aria-label="Buscar personas"
          className="h-10 w-full rounded-[var(--radius-card)] bg-surface pr-3 pl-9 text-sm text-ink shadow-float outline-none placeholder:text-ink-faint focus:ring-2 focus:ring-teal-500/30"
        />
      </form>
      <div className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Tipo de cuenta">
        {FILTERS.map((f) => chip(filter === f.id, () => setFilter(f.id), f.label))}
      </div>

      {list.error && !list.items ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : !list.items ? (
        <ListSkeleton rows={5} />
      ) : list.items.length === 0 ? (
        <EmptyState compact illustration={<NoResultsIllustration />} title="Nadie por aquí" description="No hay personas en esta lista." />
      ) : (
        <>
          <p className="px-1 text-xs text-ink-faint">{list.items.length === 200 ? 'Las 200 más recientes' : `${list.items.length} personas`} · visitas = veces que abrió la app en 30 días</p>
          <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-float">
            {list.items.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center md:px-4" data-testid="admin-person">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={p.displayName} color={p.avatarColor} photo={p.avatarUrl} size="md" online={p.online} />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 font-semibold text-ink">
                      <span className="truncate">{p.displayName}</span>
                      {p.roles.map((r) => (
                        <span key={r} className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
                          {ROLE_LABEL[r]}
                          {r === 'driver' && p.driverStatus ? ` · ${DRIVER_STATUS[p.driverStatus] ?? p.driverStatus}` : ''}
                        </span>
                      ))}
                      {p.blockedAt && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700 dark:bg-red-950 dark:text-red-300">Suspendido</span>}
                    </p>
                    <p className="truncate text-xs text-ink-soft">
                      {[p.username && `@${p.username}`, p.phone, p.businessName].filter(Boolean).join(' · ') || 'Sin usuario'}
                    </p>
                    <p className="text-xs text-ink-faint">
                      Desde {formatLongDate(p.createdAt)} · {p.online ? 'en línea' : p.lastSeenAt ? formatLastSeen(p.lastSeenAt) : 'sin conexión'}
                    </p>
                    {p.blockedReason && <p className="text-xs text-red-700 dark:text-red-300">Motivo: {p.blockedReason}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-4 pl-14 text-center sm:pl-0">
                  <Stat label="visitas" value={p.visits30d} />
                  <Stat label="pedidos" value={p.orders} />
                  {p.roles.includes('driver') && <Stat label="entregas" value={p.deliveries} />}
                  {p.roles.includes('admin') ? (
                    <span className="flex w-28 items-center justify-center gap-1 text-xs text-ink-faint">
                      <ShieldCheck className="size-4" /> Soporte
                    </span>
                  ) : p.blockedAt ? (
                    <Button variant="ghost" className="w-28" loading={busy === p.id} onClick={() => void setBlocked(p, false)}>
                      Reactivar
                    </Button>
                  ) : (
                    <Button variant="ghost" className="w-28" icon={<Ban className="size-4" />} onClick={() => setSuspending(p)}>
                      Suspender
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {suspending && (
        <SuspendModal
          person={suspending}
          busy={busy === suspending.id}
          onClose={() => setSuspending(null)}
          onConfirm={async (reason) => {
            if (await setBlocked(suspending, true, reason)) setSuspending(null);
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="w-14">
      <span className="block font-bold text-ink tabular-nums">{value}</span>
      <span className="block text-[11px] text-ink-faint">{label}</span>
    </span>
  );
}

function SuspendModal({ person, busy, onClose, onConfirm }: { person: AdminPerson; busy: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Suspender a ${person.displayName}`}
      description="No podrá entrar ni usar Parla hasta que lo reactives. Si reparte, deja de recibir pedidos al instante."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" loading={busy} disabled={!reason.trim()} onClick={() => onConfirm(reason)}>
            Suspender
          </Button>
        </>
      }
    >
      <TextAreaField label="Motivo (solo lo ve soporte)" value={reason} maxLength={300} rows={3} onChange={(e) => setReason(e.target.value)} />
    </Modal>
  );
}
