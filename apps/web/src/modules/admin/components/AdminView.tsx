import type { AdminClaim, AdminDriver, DriverStatus } from '@parla/types';
import { Check, FileImage, HandCoins, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Navigate } from 'react-router';
import { Button, IconButton } from '@shared/ui/Button';
import { Field, TextAreaField } from '@shared/ui/Field';
import { Modal } from '@shared/ui/Modal';
import { PrivatePhoto } from '@shared/ui/PrivatePhoto';
import { EmptyState, ErrorState, ListSkeleton } from '@shared/ui/States';
import { EmptyChatsIllustration } from '@shared/ui/illustrations';
import { formatLongDate, formatSoles } from '@shared/utils/money';
import { PageHeader, ServicePage } from '../../services/components/ServicesUi';
import { CLAIM_REASON_LABEL, CLAIM_STATUS_LABEL } from '../../services/const/services.const';
import { useAdmin, type ClaimsView } from '../hooks/use-admin.hook';
import { AdminCoupons } from './AdminCoupons';
import { AdminOrders } from './AdminOrders';

const DRIVER_FILTERS: { id: DriverStatus; label: string }[] = [
  { id: 'pending', label: 'Por revisar' },
  { id: 'rejected', label: 'Rechazados' },
  { id: 'approved', label: 'Aprobados' },
];
const CLAIM_FILTERS: { id: ClaimsView; label: string }[] = [
  { id: 'open', label: 'Abiertos' },
  { id: 'resolved', label: 'Resueltos' },
];

/** Panel de soporte de Parla: aprobar o rechazar repartidores y resolver reclamos con devolución. */
export function AdminView() {
  const a = useAdmin();
  const [rejecting, setRejecting] = useState<{ kind: 'driver' | 'claim'; id: string; name: string } | null>(null);
  if (!a.isAdmin) return <Navigate to="/app/ajustes" replace />;
  const list = a.tab === 'repartidores' ? a.drivers : a.claims;
  const ownList = a.tab === 'repartidores' || a.tab === 'reclamos';

  return (
    <ServicePage>
      <PageHeader
        title="Soporte Parla"
        subtitle="Pedidos, repartidores, reclamos y cupones"
        onBack={a.back}
        action={
          ownList ? (
            <IconButton label="Actualizar" onClick={list.reload}>
              <RefreshCw className="size-5" />
            </IconButton>
          ) : undefined
        }
      />

      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Panel de soporte">
        {(
          [
            ['pedidos', 'Pedidos'],
            ['repartidores', 'Repartidores'],
            ['reclamos', 'Reclamos'],
            ['cupones', 'Cupones'],
          ] as const
        ).map(([id, label]) => (
          <Chip key={id} on={a.tab === id} onClick={() => a.selectTab(id)} role="tab" testId={`admin-tab-${id}`}>
            {label}
          </Chip>
        ))}
      </div>

      {a.tab === 'pedidos' && (
        <AdminOrders
          chip={(on, onClick, label) => (
            <Chip key={label} small on={on} onClick={onClick}>
              {label}
            </Chip>
          )}
        />
      )}
      {a.tab === 'cupones' && <AdminCoupons />}

      {ownList && (
      <div className="-mt-2 flex gap-1.5 overflow-x-auto pb-1" aria-label="Filtro">
        {a.tab === 'repartidores'
          ? DRIVER_FILTERS.map((f) => (
              <Chip key={f.id} small on={a.driverStatus === f.id} onClick={() => a.setDriverStatus(f.id)}>
                {f.label}
              </Chip>
            ))
          : CLAIM_FILTERS.map((f) => (
              <Chip key={f.id} small on={a.claimsView === f.id} onClick={() => a.setClaimsView(f.id)}>
                {f.label}
              </Chip>
            ))}
      </div>
      )}

      {!ownList ? null : list.error && !list.items ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : !list.items ? (
        <ListSkeleton rows={3} />
      ) : list.items.length === 0 ? (
        <EmptyState compact illustration={<EmptyChatsIllustration />} title="Nada por aquí" description={a.tab === 'repartidores' ? 'No hay repartidores en esta lista.' : 'No hay reclamos en esta lista.'} />
      ) : a.tab === 'repartidores' ? (
        <ul className="flex flex-col gap-3" data-testid="admin-drivers">
          {a.drivers.items!.map((d) => (
            <li key={d.userId}>
              <DriverItem
                driver={d}
                busy={a.busy === `driver:${d.userId}`}
                onApprove={() => void a.reviewDriver(d.userId, 'approve')}
                onReject={() => setRejecting({ kind: 'driver', id: d.userId, name: d.displayName })}
              />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="admin-claims">
          {a.claims.items!.map((c) => (
            <li key={c.id}>
              <ClaimItem claim={c} busy={a.busy === `claim:${c.id}`} onRefund={(cents) => void a.refundClaim(c.id, cents)} onReject={() => setRejecting({ kind: 'claim', id: c.id, name: c.customerName })} />
            </li>
          ))}
        </ul>
      )}

      {rejecting && (
        <RejectModal
          title={rejecting.kind === 'driver' ? `Rechazar a ${rejecting.name}` : `No procede el reclamo de ${rejecting.name}`}
          hint={rejecting.kind === 'driver' ? 'El repartidor verá este motivo y podrá corregirlo.' : 'El cliente verá este motivo.'}
          busy={a.busy !== null}
          onClose={() => setRejecting(null)}
          onConfirm={async (note) => {
            const ok = rejecting.kind === 'driver' ? await a.reviewDriver(rejecting.id, 'reject', note) : await a.rejectClaim(rejecting.id, note);
            if (ok) setRejecting(null);
          }}
        />
      )}
    </ServicePage>
  );
}

function Chip({ on, onClick, children, small = false, role, testId }: { on: boolean; onClick: () => void; children: ReactNode; small?: boolean; role?: string; testId?: string }) {
  return (
    <button
      type="button"
      role={role}
      aria-selected={role ? on : undefined}
      aria-pressed={role ? undefined : on}
      onClick={onClick}
      data-testid={testId}
      className={`${small ? 'h-8 px-3 text-xs' : 'h-9 px-4 text-sm'} shrink-0 rounded-full font-semibold transition-colors duration-200 ${on ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200' : 'bg-surface text-ink-soft shadow-float hover:text-ink'}`}
    >
      {children}
    </button>
  );
}

function DriverItem({ driver, busy, onApprove, onReject }: { driver: AdminDriver; busy: boolean; onApprove: () => void; onReject: () => void }) {
  const [showDoc, setShowDoc] = useState(false);
  return (
    <article className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-float md:p-5" data-testid="admin-driver" data-user={driver.userId}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-ink">{driver.displayName}</p>
          <p className="text-sm text-ink-soft">
            {driver.vehicle}
            {driver.plate ? ` · ${driver.plate}` : ''}
            {driver.phone ? ` · ${driver.phone}` : ''}
          </p>
        </div>
        <span className="shrink-0 text-xs text-ink-faint">{formatLongDate(driver.createdAt)}</span>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-surface-3 px-3 py-2">
          <dt className="text-xs text-ink-faint">DNI</dt>
          <dd className="font-mono font-semibold text-ink">{driver.dniNumber ?? '—'}</dd>
        </div>
        <div className="rounded-xl bg-surface-3 px-3 py-2">
          <dt className="text-xs text-ink-faint">Licencia</dt>
          <dd className="font-mono font-semibold text-ink">{driver.licenseNumber ?? 'No necesita'}</dd>
        </div>
      </dl>
      {driver.reviewNote && <p className="text-sm text-ink-soft">Motivo del rechazo: «{driver.reviewNote}»</p>}
      {driver.hasDocument ? (
        <>
          <Button variant="ghost" size="sm" className="self-start" icon={<FileImage className="size-4" />} onClick={() => setShowDoc((v) => !v)} data-testid="show-document">
            {showDoc ? 'Ocultar documento' : 'Ver documento'}
          </Button>
          {showDoc && <PrivatePhoto path={`/admin/drivers/${encodeURIComponent(driver.userId)}/document`} alt={`Documento de ${driver.displayName}`} />}
        </>
      ) : (
        <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Todavía no subió la foto de su documento.</p>
      )}
      {driver.status !== 'approved' && (
        <div className="flex gap-2">
          <Button icon={<Check className="size-4" />} onClick={onApprove} loading={busy} disabled={!driver.hasDocument} data-testid="approve-driver">
            Aprobar
          </Button>
          {driver.status === 'pending' && (
            <Button variant="ghost" icon={<X className="size-4" />} onClick={onReject} disabled={busy} data-testid="reject-driver">
              Rechazar
            </Button>
          )}
        </div>
      )}
    </article>
  );
}

function ClaimItem({ claim, busy, onRefund, onReject }: { claim: AdminClaim; busy: boolean; onRefund: (cents: number) => void; onReject: () => void }) {
  const [amount, setAmount] = useState(((Math.min(claim.suggestedCents, claim.refundableCents) || 0) / 100).toFixed(2));
  const cents = Math.round(Number(amount.replace(',', '.')) * 100);
  const validAmount = Number.isFinite(cents) && cents >= 1 && cents <= claim.refundableCents;
  const [showPhotos, setShowPhotos] = useState(false);
  const open = claim.status === 'open';

  return (
    <article className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-float md:p-5" data-testid="admin-claim" data-status={claim.status}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-ink">{CLAIM_REASON_LABEL[claim.reason]}</p>
          <p className="text-sm text-ink-soft">
            {claim.customerName}
            {claim.businessName ? ` · ${claim.businessName}` : ''}
            {claim.driverName ? ` · repartidor ${claim.driverName}` : ''}
          </p>
        </div>
        <span className="shrink-0 text-xs font-bold text-ink-soft">{CLAIM_STATUS_LABEL[claim.status]}</span>
      </div>
      {claim.items.length > 0 && <p className="text-sm text-ink">{claim.items.map((i) => `${i.quantity}× ${i.name} (${formatSoles(i.totalCents)})`).join(' · ')}</p>}
      {claim.comment && <p className="text-sm text-ink">«{claim.comment}»</p>}
      <p className="text-sm text-ink-soft">
        Pedido de {formatSoles(claim.orderTotalCents)} · sugerido {formatSoles(claim.suggestedCents)}
        {open ? ` · se puede devolver hasta ${formatSoles(claim.refundableCents)}` : ''}
        {claim.deliveredWithoutCode ? ' · entregado sin código (con foto)' : ''}
      </p>
      {claim.resolutionNote && <p className="text-sm text-ink-soft">Resolución: {claim.resolutionNote}</p>}

      {(claim.hasPhoto || claim.hasDeliveryPhoto) && (
        <>
          <Button variant="ghost" size="sm" className="self-start" icon={<FileImage className="size-4" />} onClick={() => setShowPhotos((v) => !v)}>
            {showPhotos ? 'Ocultar fotos' : 'Ver fotos'}
          </Button>
          {showPhotos && (
            <div className="grid gap-2 sm:grid-cols-2">
              {claim.hasPhoto && (
                <figure className="flex flex-col gap-1">
                  <PrivatePhoto path={`/orders/${encodeURIComponent(claim.orderId)}/claims/${encodeURIComponent(claim.id)}/photo`} alt="Foto del cliente" />
                  <figcaption className="text-xs text-ink-faint">Foto del cliente</figcaption>
                </figure>
              )}
              {claim.hasDeliveryPhoto && (
                <figure className="flex flex-col gap-1">
                  <PrivatePhoto path={`/orders/${encodeURIComponent(claim.orderId)}/delivery-photo`} alt="Foto de la entrega" />
                  <figcaption className="text-xs text-ink-faint">Foto de la entrega</figcaption>
                </figure>
              )}
            </div>
          )}
        </>
      )}

      {open && claim.refundableCents > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Devolver (S/)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-36" data-testid="refund-amount" />
          <Button icon={<HandCoins className="size-4" />} onClick={() => onRefund(cents)} loading={busy} disabled={!validAmount} data-testid="refund-claim">
            Devolver
          </Button>
          <Button variant="ghost" icon={<X className="size-4" />} onClick={onReject} disabled={busy} data-testid="reject-claim">
            No procede
          </Button>
        </div>
      )}
      {claim.status === 'refunding' && <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-300"><ShieldCheck className="size-4" /> Devolución en curso en PagaYa…</p>}
    </article>
  );
}

function RejectModal({ title, hint, busy, onClose, onConfirm }: { title: string; hint: string; busy: boolean; onClose: () => void; onConfirm: (note: string) => void }) {
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
          <Button variant="danger" icon={<X className="size-4" />} onClick={() => onConfirm(note.trim())} disabled={!note.trim()} loading={busy} data-testid="confirm-reject">
            Confirmar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <TextAreaField label="Motivo" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} data-testid="reject-note" />
        <p className="text-xs text-ink-faint">{hint}</p>
      </div>
    </Modal>
  );
}
