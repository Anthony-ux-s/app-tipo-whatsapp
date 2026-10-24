import type { BusinessInfo, FerrohubConnectResult, FerrohubProvisionRequest, FerrohubProvisionResult, FerrohubSsoResult } from '@parla/types';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useBusinessStore } from '@shared/stores/business.store';
import { useSessionStore } from '@shared/stores/session.store';
import { toast } from '@shared/stores/toast.store';
import { errorMessage, http } from '@shared/utils/http';
import { FERRETERIA_RUBROS, formatFerrohubCode, isFerrohubCodeComplete } from '../const/connectors.const';

/** Pasos que se muestran mientras Parla conecta la tienda (el servidor los hace en una sola llamada). */
export const CONNECT_STEPS = ['Comprobando tu código…', 'Leyendo tus productos…', 'Preparando tu tienda…'];

/** «Ya uso FerroHub»: un código de enlace y Parla hace el resto. */
export function useConnectFerrohub() {
  const navigate = useNavigate();
  const setBusiness = useBusinessStore((s) => s.setBusiness);
  const [code, setCode] = useState('');
  const [step, setStep] = useState(0);
  const connect = useMutation({
    mutationFn: async () => {
      // El avance es solo visual: el servidor canjea el código, prueba los productos y precarga la tienda en una llamada.
      setStep(0);
      const timers = [window.setTimeout(() => setStep(1), 700), window.setTimeout(() => setStep(2), 1600)];
      try {
        return await http.post<FerrohubConnectResult>('/stores/ferrohub/connect', { code });
      } finally {
        timers.forEach((t) => window.clearTimeout(t));
      }
    },
    onSuccess: (result) => {
      setBusiness(result.business);
      toast(result.verified ? '¡Listo! Tu ferretería ya está en Parla.' : 'Conectada. Soporte la revisará pronto.', 'success');
      // Los datos de la tienda se configuran en FerroHub: Parla ya los leyó y «Mi negocio» dice si falta algo.
      navigate('/app/negocio', { replace: true });
    },
  });

  return {
    code,
    complete: isFerrohubCodeComplete(code),
    onCodeChange: (value: string) => {
      if (connect.isError) connect.reset();
      setCode(formatFerrohubCode(value));
    },
    submit: () => connect.mutate(),
    busy: connect.isPending,
    step,
    error: connect.isError ? errorMessage(connect.error) : null,
    back: () => navigate('/app/negocio/nueva/ferreteria'),
  };
}

/** «Crear mi ferretería»: Parla la crea en FerroHub y lleva al dueño a su panel, ya conectado. */
export function useProvisionFerrohub() {
  const navigate = useNavigate();
  const user = useSessionStore((s) => s.user)!;
  const setBusiness = useBusinessStore((s) => s.setBusiness);
  const [form, setForm] = useState<FerrohubProvisionRequest>({
    name: '',
    city: '',
    categories: [],
    ruc: '',
    ownerName: user.displayName,
    email: user.email ?? '',
    phone: user.phone ?? '',
  });
  const create = useMutation({
    mutationFn: () => http.post<FerrohubProvisionResult>('/stores/ferrohub/provision', form),
    onSuccess: (result) => {
      setBusiness(result.business);
      // El enlace es de un solo uso y dura 60 s: se abre ya, sin pasar por otra pantalla.
      window.location.assign(result.ssoUrl);
    },
  });
  const valid = form.name.trim().length >= 3 && form.city.trim().length >= 2 && /^\S+@\S+\.\S+$/.test(form.email.trim()) && form.phone.replace(/\D/g, '').length >= 8;

  return {
    form,
    valid,
    rubros: FERRETERIA_RUBROS,
    onChange: (changes: Partial<FerrohubProvisionRequest>) => {
      if (create.isError) create.reset();
      setForm((f) => ({ ...f, ...changes }));
    },
    toggleRubro: (rubro: string) =>
      setForm((f) => ({ ...f, categories: f.categories?.includes(rubro) ? f.categories.filter((r) => r !== rubro) : [...(f.categories ?? []), rubro] })),
    submit: () => create.mutate(),
    busy: create.isPending || create.isSuccess,
    error: create.isError ? errorMessage(create.error) : null,
    back: () => navigate('/app/negocio/nueva/ferreteria'),
    goConnect: () => navigate('/app/negocio/nueva/ferreteria/conectar'),
  };
}

/** «Mi negocio» de una tienda conectada: abrir su panel de FerroHub o desvincular. */
export function useFerrohubLink(business: BusinessInfo, autoSync = false) {
  const setBusiness = useBusinessStore((s) => s.setBusiness);
  const [confirming, setConfirming] = useState(false);
  const panel = useMutation({
    mutationFn: () => http.post<FerrohubSsoResult>('/business/ferrohub/sso'),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (err) => toast(errorMessage(err), 'error'),
  });
  const unlink = useMutation({
    mutationFn: () => http.delete<BusinessInfo>('/business/ferrohub'),
    onSuccess: (updated) => {
      setBusiness(updated);
      setConfirming(false);
      toast('Tu tienda se desvinculó de FerroHub.', 'success');
    },
    onError: (err) => toast(errorMessage(err), 'error'),
  });

  const sync = useMutation({
    mutationFn: () => http.post<BusinessInfo>('/business/ferrohub/sync'),
    onSuccess: (updated) => setBusiness(updated),
  });
  const connected = business.connector === 'ferrohub';
  // Al entrar a «Mi negocio» se vuelve a leer la ficha de FerroHub (una vez), por si la configuró allá.
  const synced = useRef(false);
  useEffect(() => {
    if (!autoSync || !connected || synced.current) return;
    synced.current = true;
    sync.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, autoSync]);

  return {
    /** Falta la dirección o la ubicación: se configuran en FerroHub. */
    needsSetup: connected && (business.location === null || business.address.trim().length < 6 || business.address === 'Por confirmar'),
    syncing: sync.isPending,
    refresh: () => sync.mutate(undefined, { onSuccess: () => toast('Datos actualizados desde FerroHub.', 'success'), onError: (err) => toast(errorMessage(err), 'error') }),
    connected,
    verified: business.verified,
    openPanel: () => panel.mutate(),
    openingPanel: panel.isPending,
    confirming,
    askUnlink: () => setConfirming(true),
    cancelUnlink: () => setConfirming(false),
    unlink: () => unlink.mutate(),
    unlinking: unlink.isPending,
  };
}
