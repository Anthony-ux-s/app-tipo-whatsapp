import type { IntegrationTestResult, StoreIntegrationFormat, StoreIntegrationInfo, StoreIntegrationInput } from '@parla/types';
import { useEffect, useState } from 'react';
import { useBusinessStore } from '@shared/stores/business.store';
import { toast } from '@shared/stores/toast.store';
import { errorMessage, http } from '@shared/utils/http';

/** «Conectar mi sistema»: la tienda que ya tiene su propia API la conecta a Parla (o vuelve al catálogo de Parla). */
export function useIntegration() {
  const business = useBusinessStore((s) => s.business);
  const setBusiness = useBusinessStore((s) => s.setBusiness);
  const [info, setInfo] = useState<StoreIntegrationInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [baseUrl, setBaseUrl] = useState('');
  const [prefix, setPrefix] = useState('');
  const [format, setFormat] = useState<StoreIntegrationFormat>('parla');
  const [apiKey, setApiKey] = useState('');
  const [adminKey, setAdminKey] = useState('');
  const [busy, setBusy] = useState<'test' | 'save' | 'off' | null>(null);
  const [result, setResult] = useState<IntegrationTestResult | null>(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    http
      .get<StoreIntegrationInfo>('/business/integration')
      .then((found) => {
        if (!alive) return;
        setInfo(found);
        setBaseUrl(found.baseUrl);
        setPrefix(found.prefix);
        setFormat(found.format);
      })
      .catch((err) => alive && setError(errorMessage(err)));
    return () => {
      alive = false;
    };
  }, [attempt]);

  /** Las llaves de RED WIIIL empiezan con «wiiil_»: se usa su API y no hace falta la ruta. */
  const redWiiil = format === 'redwiiil';
  const body = (): StoreIntegrationInput => ({
    format,
    baseUrl: baseUrl.trim(),
    prefix: redWiiil ? '' : prefix.trim(),
    apiKey: apiKey.trim() || undefined,
    adminKey: adminKey.trim() || undefined,
  });

  const applySaved = (saved: StoreIntegrationInfo) => {
    setInfo(saved);
    setBaseUrl(saved.baseUrl);
    setPrefix(saved.prefix);
    setFormat(saved.format);
    setApiKey('');
    setAdminKey('');
    if (business) setBusiness({ ...business, source: saved.source });
  };

  return {
    business,
    info,
    error,
    retry: () => setAttempt((n) => n + 1),
    baseUrl,
    prefix,
    format,
    apiKey,
    adminKey,
    busy,
    result,
    redWiiil,
    onBaseUrl: (value: string) => {
      setBaseUrl(value);
      setResult(null);
    },
    onPrefix: (value: string) => {
      setPrefix(value);
      setResult(null);
    },
    onFormat: (value: StoreIntegrationFormat) => {
      setFormat(value);
      setResult(null);
    },
    onApiKey: (value: string) => {
      setApiKey(value);
      setResult(null);
      if (value.trim().startsWith('wiiil_')) setFormat('redwiiil');
    },
    onAdminKey: setAdminKey,
    canSubmit: !!baseUrl.trim() && (!!apiKey.trim() || !!info?.apiKeySet),
    test: async () => {
      setBusy('test');
      setResult(null);
      try {
        setResult(await http.post<IntegrationTestResult>('/business/integration/test', body()));
      } catch (err) {
        toast(errorMessage(err), 'error');
      } finally {
        setBusy(null);
      }
    },
    /** Guardar conecta la tienda: desde ese momento sus productos salen de su sistema. */
    save: async () => {
      setBusy('save');
      try {
        applySaved(await http.put<StoreIntegrationInfo>('/business/integration', body()));
        toast('Listo: tu sistema quedó conectado. Tus clientes ven los productos de tu sistema.', 'success');
      } catch (err) {
        toast(errorMessage(err), 'error');
      } finally {
        setBusy(null);
      }
    },
    /** Deja de usar su sistema y vuelve al catálogo propio de Parla. */
    disconnect: async () => {
      setBusy('off');
      try {
        applySaved(await http.put<StoreIntegrationInfo>('/business/integration', { baseUrl: '', prefix: '' } satisfies StoreIntegrationInput));
        setResult(null);
        toast('Desconectado: ahora usas el catálogo de Parla.', 'success');
      } catch (err) {
        toast(errorMessage(err), 'error');
      } finally {
        setBusy(null);
      }
    },
  };
}
