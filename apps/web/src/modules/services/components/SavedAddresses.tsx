import type { DeliveryAddress, SavedAddress } from '@parla/types';
import { Briefcase, Home, MapPin, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from '@shared/stores/toast.store';
import { Button } from '@shared/ui/Button';
import { Modal } from '@shared/ui/Modal';
import { errorMessage, http } from '@shared/utils/http';

const QUICK_LABELS = ['Casa', 'Trabajo'];
const iconFor = (label: string) => (label === 'Casa' ? Home : label === 'Trabajo' ? Briefcase : MapPin);

/**
 * Direcciones que ya usó para pedir (se guardan solas): un toque la pone en el carrito. Se les puede
 * poner nombre («Casa», «Trabajo») o borrarlas.
 */
export function SavedAddresses({ current, onPick }: { current: DeliveryAddress; onPick: (address: DeliveryAddress) => void }) {
  const [list, setList] = useState<SavedAddress[]>([]);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    http
      .get<SavedAddress[]>('/addresses')
      .then(setList)
      .catch(() => undefined);
  }, []);

  if (list.length === 0) return null;
  return (
    <div className="flex flex-col gap-2" aria-label="Mis direcciones">
      <div className="flex gap-2 overflow-x-auto pb-1" data-testid="saved-addresses">
        {list.map((a) => {
          const Icon = iconFor(a.label);
          const on = a.line === current.line.trim();
          return (
            <button
              key={a.id}
              type="button"
              aria-pressed={on}
              onClick={() => onPick({ line: a.line, reference: a.reference, location: a.location })}
              className={`flex max-w-56 shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors duration-200 ${on ? 'bg-teal-100 text-ink ring-2 ring-teal-500 dark:bg-teal-900/60 dark:text-ink' : 'bg-surface-3 text-ink-soft hover:text-ink'}`}
            >
              <Icon className="size-4 shrink-0" />
              <span className="min-w-0">
                {a.label && <span className="block font-bold">{a.label}</span>}
                <span className="block truncate">{a.line}</span>
              </span>
            </button>
          );
        })}
        <button type="button" onClick={() => setEditing(true)} aria-label="Editar mis direcciones" className="flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-ink-soft hover:bg-surface-3 hover:text-ink">
          <Pencil className="size-4" /> Editar
        </button>
      </div>
      {editing && <EditAddresses list={list} onChange={setList} onClose={() => setEditing(false)} />}
    </div>
  );
}

function EditAddresses({ list, onChange, onClose }: { list: SavedAddress[]; onChange: (list: SavedAddress[]) => void; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title="Mis direcciones" footer={<Button onClick={onClose}>Listo</Button>}>
      <AddressList list={list} onChange={onChange} />
    </Modal>
  );
}

/** Lista para nombrar («Casa», «Trabajo») o borrar las direcciones guardadas. También en Ajustes. */
export function AddressList({ list, onChange }: { list: SavedAddress[]; onChange: (list: SavedAddress[]) => void }) {
  const [busy, setBusy] = useState<string | null>(null);

  const label = async (a: SavedAddress, value: string) => {
    setBusy(a.id);
    try {
      const updated = await http.patch<SavedAddress>(`/addresses/${encodeURIComponent(a.id)}`, { label: value });
      onChange(list.map((x) => (x.id === a.id ? updated : x)));
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  };
  const remove = async (a: SavedAddress) => {
    setBusy(a.id);
    try {
      await http.delete(`/addresses/${encodeURIComponent(a.id)}`);
      onChange(list.filter((x) => x.id !== a.id));
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  return list.length === 0 ? (
    <p className="text-sm text-ink-soft">No tienes direcciones guardadas. Se guardan solas cuando pides.</p>
  ) : (
    <ul className="flex flex-col gap-3">
      {list.map((a) => (
        <li key={a.id} className="flex flex-col gap-2 rounded-xl bg-surface-3 p-3" data-testid="saved-address">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 text-sm text-ink">
              <span className="block font-semibold">{a.line}</span>
              {a.reference && <span className="block text-ink-soft">{a.reference}</span>}
            </p>
            <button type="button" onClick={() => void remove(a)} disabled={busy === a.id} aria-label={`Borrar ${a.line}`} className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-faint hover:bg-surface hover:text-ink">
              <Trash2 className="size-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Nombre de ${a.line}`}>
            {[...QUICK_LABELS, ''].map((l) => (
              <button
                key={l || 'none'}
                type="button"
                role="radio"
                aria-checked={a.label === l}
                disabled={busy === a.id}
                onClick={() => void label(a, l)}
                className={`h-8 rounded-full px-3 text-xs font-semibold transition-colors duration-200 ${a.label === l ? 'bg-brand text-white' : 'bg-surface text-ink-soft hover:text-ink'}`}
              >
                {l || 'Sin nombre'}
              </button>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
