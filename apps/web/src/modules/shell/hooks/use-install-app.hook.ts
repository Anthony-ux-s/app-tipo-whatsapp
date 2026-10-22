import { useCallback, useEffect, useState } from 'react';
import { toast } from '@shared/stores/toast.store';

/** El evento (solo Chrome, Edge y Android) con el que el navegador ofrece instalar la PWA. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

/**
 * Instalar Parla como app (PWA): en Android y computadora el navegador lo permite con un toque; en iPhone
 * hay que usar «Compartir → Agregar a inicio», así que se muestra esa indicación. Si ya está instalada
 * (se abrió como app), no se ofrece.
 */
export function useInstallApp() {
  const [event, setEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() => (typeof window === 'undefined' ? false : isStandalone()));

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setEvent(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const ios = typeof navigator !== 'undefined' && isIos();
  const available = !installed && (!!event || ios);

  const install = useCallback(async () => {
    if (event) {
      await event.prompt();
      const { outcome } = await event.userChoice;
      if (outcome === 'accepted') setInstalled(true);
      setEvent(null);
      return;
    }
    if (ios) toast('En el iPhone: toca «Compartir» y luego «Agregar a inicio».', 'info');
  }, [event, ios]);

  return { available, install };
}
