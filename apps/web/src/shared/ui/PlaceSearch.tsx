import type { GeoPoint } from '@parla/types';
import { MapPin, Search } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { searchPlaces, type PlaceResult } from '../utils/geocode';
import { Button } from './Button';

interface PlaceSearchProps {
  /** El lugar elegido: el mapa se centra ahí y el pin queda en ese punto. */
  onSelect: (point: GeoPoint, label: string) => void;
  placeholder?: string;
}

/**
 * Buscador de direcciones para los mapas que marcan un punto: al buscar, el pin salta al primer resultado
 * (el mapa se mueve solo) y quedan abajo los demás por si no era ese.
 */
export function PlaceSearch({ onSelect, placeholder = 'Busca una dirección o un lugar' }: PlaceSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [chosen, setChosen] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (query.trim().length < 3) {
      setError('Escribe al menos 3 letras');
      return;
    }
    controller.current?.abort();
    controller.current = new AbortController();
    setLoading(true);
    setError(null);
    try {
      const found = await searchPlaces(query, controller.current.signal);
      setResults(found);
      setChosen(0);
      if (found.length === 0) setError('No encontramos ese lugar. Prueba con la calle y el distrito.');
      else onSelect(found[0].point, found[0].label);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2" data-testid="place-search">
      <form onSubmit={(event) => void submit(event)} className="flex gap-2" role="search">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            aria-label="Buscar en el mapa"
            enterKeyHint="search"
            className="h-11 w-full rounded-xl border border-line bg-surface pr-3 pl-9 text-[15px] text-ink outline-none placeholder:text-ink-faint/60 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
          />
        </div>
        <Button type="submit" variant="secondary" loading={loading} disabled={query.trim().length < 3}>
          Buscar
        </Button>
      </form>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {results && results.length > 1 && (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line" aria-label="Resultados">
          {results.map((r, i) => (
            <li key={`${r.point.lat},${r.point.lng}`}>
              <button
                type="button"
                onClick={() => {
                  setChosen(i);
                  onSelect(r.point, r.label);
                }}
                className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-2 ${i === chosen ? 'bg-teal-50 text-brand dark:bg-teal-950/60 dark:text-teal-300' : 'text-ink'}`}
              >
                <MapPin className="mt-0.5 size-4 shrink-0" />
                <span className="line-clamp-2">{r.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
