import type { AdminStore, ReviewStoreRequest, StoreStatus } from '@parla/types';
import { Ban, Check, MapPin, Phone, RotateCcw, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { toast } from '@shared/stores/toast.store';
import { Button } from '@shared/ui/Button';
import { TextAreaField } from '@shared/ui/Field';
import { Modal } from '@shared/ui/Modal';
import { EmptyState, ErrorState, ListSkeleton } from '@shared/ui/States';
import { EmptyChatsIllustration } from '@shared/ui/illustrations';
import { errorMessage, http } from '@shared/utils/http';
import { formatLongDate } from '@shared/utils/money';
import { SERVICE_VISUALS } from '../../services/const/services.const';
import { useAdminList } from '../hooks/use-admin.hook';

type StoreFilter = StoreStatus | 'all';

const FILTERS: { id: StoreFilter; label: string }[] = [
  { id: 'pending', label: 'Pendientes' },
  { id: 'approved', label: 'Aprobadas' },
  { id: 'rejected', label: 'Rechazadas' },
  { id: 'suspended', label: 'Suspendidas' },
  { id: 'all', label: 'Todas' },
];

const STATUS_LABEL: Record<StoreStatus, string> = { pending: 'Por revisar', approved: 'Aprobada', rejected: 'Rechazada', suspended: 'Suspendida' };
const STATUS_STYLE: Record<StoreStatus, string> = {
  pending: 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200',
  approved: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200',
  rejected: 'bg-rose-100 text-rose-900 dark:bg-rose-900/50 dark:text-rose-200',
  suspended: 'bg-surface-3 text-ink-soft',
};

/** Pendientes primero; dentro de cada estado, las más nuevas arriba. */
function sortStores(stores: AdminStore[]): AdminStore[] {
  return [...stores].sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending') || b.createdAt.localeCompare(a.createdAt));
}

/**
 * Soporte: las tiendas que registran los dueños. Se aprueban, se rechazan o se suspenden (con un motivo
 * que ve el dueño) y se reactivan.
 */
export function AdminStores({ chip }: { chip: (on: boolean, onClick: () => void, label: string) => ReactNode }) {
  const list = useAdminList<AdminStore>('/admin/stores?status=all');
  const [filter, setFilter] = useState<StoreFilter>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [asking, setAsking] = useState<{ store: AdminStore; action: 'reject' | 'suspend' } | null>(null);

  const stores = useMemo(() => sortStores(list.items ?? []), [list.items]);
  const pending = stores.filter((s) => s.status === 'pending').length;
  const shown = filter === 'all' ? stores : stores.filter((s) => s.status === filter);

  const review = async (store: AdminStore, request: ReviewStoreRequest, done: string) => {
    setBusy(store.id);
    try {
      await http.post<AdminStore>(`/admin/stores/${encodeURIComponent(store.id)}/review`, request);
      toast(done, 'success');
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
    <div className="flex flex-col gap-4" data-testid="admin-stores">
      <div className="flex flex-wrap gap-1.5" aria-label="Filtro por estado">
        {FILTERS.map((f) => chip(filter === f.id, () => setFilter(f.id), f.id === 'pending' && pending > 0 ? `${f.label} · ${pending}` : f.label))}
      </div>

      {list.error && !list.items ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : !list.items ? (
        <ListSkeleton rows={3} />
      ) : shown.length === 0 ? (
        <EmptyState compact illustration={<EmptyChatsIllustration />} title="Nada por aquí" description={filter === 'pending' ? 'No hay tiendas esperando revisión.' : 'No hay tiendas en esta lista.'} />
      ) : (
        <ul className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
          {shown.map((store) => (
            <li key={store.id}>
              <StoreItem
                store={store}
                busy={busy === store.id}
                onApprove={() => void review(store, { action: 'approve' }, `«${store.name}» aprobada: ya recibe pedidos.`)}
                onReactivate={() => void review(store, { action: 'reactivate' }, `«${store.name}» reactivada.`)}
                onReject={() => setAsking({ store, action: 'reject' })}
                onSuspend={() => setAsking({ store, action: 'suspend' })}
              />
            </li>
          ))}
        </ul>
      )}

      {asking && (
        <NoteModal
          title={asking.action === 'reject' ? `Rechazar «${asking.store.name}»` : `Suspender «${asking.store.name}»`}
          hint={asking.action === 'reject' ? 'El dueño verá este motivo en Mi negocio.' : 'El dueño verá este motivo y la tienda dejará de recibir pedidos.'}
          busy={busy !== null}
          onClose={() => setAsking(null)}
          onConfirm={async (note) => {
            const done = asking.action === 'reject' ? 'Tienda rechazada: le avisamos el motivo.' : 'Tienda suspendida.';
            if (await review(asking.store, { action: asking.action, note }, done)) setAsking(null);
          }}
        />
      )}
    </div>
  );
}

function StoreItem({ store, busy, onApprove, onReject, onSuspend, onReactivate }: { store: AdminStore; busy: boolean; onApprove: () => void; onReject: () => void; onSuspend: () => void; onReactivate: () => void }) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-float md:p-5" data-testid={`admin-store-${store.id}`} data-status={store.status}>
      <header className="flex items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-bold text-ink">{store.name}</span>
          <span className="block text-xs text-ink-soft">{SERVICE_VISUALS[store.service].title}</span>
        </span>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLE[store.status]}`}>{STATUS_LABEL[store.status]}</span>
      </header>

      {store.description && <p className="line-clamp-2 text-sm text-ink-soft">{store.description}</p>}

      <dl className="flex flex-col gap-1 text-sm text-ink-soft">
        <div>
          Dueño: <b className="font-semibold text-ink">{store.ownerName}</b>
        </div>
        {store.ownerPhone && (
          <div className="flex items-center gap-1.5">
            <Phone className="size-3.5 shrink-0" /> {store.ownerPhone}
          </div>
        )}
        {store.address && (
          <div className="flex items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0" /> {store.address}
          </div>
        )}
        <div>
          Catálogo: {store.source === 'native' ? `de Parla · ${store.productCount} ${store.productCount === 1 ? 'producto' : 'productos'}` : 'su propio sistema (API)'}
        </div>
        <div>Registrada el {formatLongDate(store.createdAt)}</div>
        {store.reviewNote && (
          <div>
            Motivo: <span className="font-semibold text-ink">{store.reviewNote}</span>
          </div>
        )}
      </dl>

      <div className="flex flex-wrap gap-2">
        {(store.status === 'pending' || store.status === 'rejected') && (
          <Button size="sm" icon={<Check className="size-4" />} onClick={onApprove} loading={busy} data-testid="approve-store">
            Aprobar
          </Button>
        )}
        {store.status === 'pending' && (
          <Button variant="ghost" size="sm" icon={<X className="size-4" />} onClick={onReject} disabled={busy} data-testid="reject-store">
            Rechazar
          </Button>
        )}
        {store.status === 'approved' && (
          <Button variant="secondary" size="sm" icon={<Ban className="size-4" />} onClick={onSuspend} disabled={busy} data-testid="suspend-store">
            Suspender
          </Button>
        )}
        {store.status === 'suspended' && (
          <Button size="sm" icon={<RotateCcw className="size-4" />} onClick={onReactivate} loading={busy} data-testid="reactivate-store">
            Reactivar
          </Button>
        )}
      </div>
    </article>
  );
}

function NoteModal({ title, hint, busy, onClose, onConfirm }: { title: string; hint: string; busy: boolean; onClose: () => void; onConfirm: (note: string) => void }) {
  const [note, setNote] = useState('');
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Volver</Button>
          <Button variant="danger" onClick={() => onConfirm(note.trim())} disabled={!note.trim()} loading={busy} data-testid="confirm-store-note">
            Confirmar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <TextAreaField label="Motivo" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} data-testid="store-note" />
        <p className="text-xs text-ink-faint">{hint}</p>
      </div>
    </Modal>
  );
}
