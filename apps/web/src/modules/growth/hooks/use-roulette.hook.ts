import type { PublicRoulette, RouletteSpinResult } from '@parla/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from '@shared/stores/toast.store';
import { errorMessage, http } from '@shared/utils/http';
import { landingRotation } from '../utils/roulette.utils';

export type RoulettePhase = 'hidden' | 'ready' | 'spinning' | 'settling' | 'result';

const SHOW_DELAY_MS = 1400;
const SPIN_MS = 5200;
const SPIN_MS_REDUCED = 700;
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Se pregunta una vez por sesión: si la persona dijo «ahora no», no se le insiste hasta la próxima vez. */
const dismissKey = (id: string) => `parla.roulette.dismissed.${id}`;
const wasDismissed = (id: string) => {
  try {
    return sessionStorage.getItem(dismissKey(id)) === '1';
  } catch {
    return false;
  }
};

/**
 * La ruleta de bienvenida: al abrir la app pregunta al servidor si hay una para esta persona, la
 * muestra con un respiro y la hace girar hasta el premio que el servidor eligió.
 */
export function useRoulette() {
  const navigate = useNavigate();
  const [roulette, setRoulette] = useState<PublicRoulette | null>(null);
  const [phase, setPhase] = useState<RoulettePhase>('hidden');
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<RouletteSpinResult | null>(null);
  const [spinMs, setSpinMs] = useState(SPIN_MS);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    let alive = true;
    http
      .get<{ roulette: PublicRoulette | null }>('/roulette')
      .then(({ roulette: found }) => {
        // En modo de prueba se muestra en cada visita, aunque la hayan cerrado antes.
        if (!alive || !found || (!found.testMode && wasDismissed(found.id))) return;
        timers.current.push(
          window.setTimeout(() => {
            setRoulette(found);
            setPhase('ready');
          }, SHOW_DELAY_MS),
        );
      })
      // Sin ruleta o sin conexión: la app sigue como siempre.
      .catch(() => undefined);
    return () => {
      alive = false;
      timers.current.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const close = useCallback(() => {
    if (roulette && !roulette.testMode && phase !== 'result') {
      try {
        sessionStorage.setItem(dismissKey(roulette.id), '1');
      } catch {
        /* sin almacenamiento: se preguntará de nuevo */
      }
    }
    setPhase('hidden');
  }, [roulette, phase]);

  const spin = useCallback(async () => {
    if (!roulette || phase !== 'ready') return;
    setPhase('spinning');
    try {
      const won = await http.post<RouletteSpinResult>(`/roulette/${roulette.id}/spin`);
      const ms = reducedMotion() ? SPIN_MS_REDUCED : SPIN_MS;
      setSpinMs(ms);
      setResult(won);
      // Parar en cualquier parte del gajo, no siempre en el centro.
      setRotation((current) => landingRotation(current, won.prizeIndex, roulette.prizes.length, reducedMotion() ? 1 : 6, (Math.random() - 0.5) * 0.6));
      setPhase('settling');
      // Respaldo por si el navegador no avisa que terminó la transición.
      timers.current.push(window.setTimeout(() => setPhase((p) => (p === 'settling' ? 'result' : p)), ms + 400));
    } catch (error) {
      toast(errorMessage(error), 'error');
      setPhase('hidden');
    }
  }, [roulette, phase]);

  /** Para las estrategias sin rueda (rasca y gana, cofre, oferta relámpago): pide el premio y listo. */
  const play = useCallback(async () => {
    if (!roulette) throw new Error('Sin campaña');
    try {
      return await http.post<RouletteSpinResult>(`/roulette/${roulette.id}/spin`);
    } catch (error) {
      toast(errorMessage(error), 'error');
      throw error;
    }
  }, [roulette]);

  const settled = useCallback(() => {
    setPhase((p) => (p === 'settling' ? 'result' : p));
    if (typeof navigator !== 'undefined') navigator.vibrate?.([30, 40, 30]);
  }, []);

  return {
    roulette,
    phase,
    rotation,
    spinMs,
    result,
    spin,
    play,
    settled,
    close,
    useNow: () => {
      setPhase('hidden');
      navigate('/app/ofertas');
    },
  };
}
