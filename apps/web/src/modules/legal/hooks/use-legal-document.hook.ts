import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useSessionStore } from '@shared/stores/session.store';
import { LEGAL_UPDATED, LEGAL_VERSION, PRIVACY, TERMS } from '../const/legal.const';
import type { LegalDocument } from '../types/legal.types';

/** Documento legal a mostrar y a dónde volver. */
export function useLegalDocument(slug: LegalDocument['slug']) {
  const navigate = useNavigate();
  const signedIn = useSessionStore((s) => s.status === 'ready');
  const document = slug === 'terminos' ? TERMS : PRIVACY;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  return {
    document,
    other: slug === 'terminos' ? { to: '/legal/privacidad', label: PRIVACY.title } : { to: '/legal/terminos', label: TERMS.title },
    version: LEGAL_VERSION,
    updated: LEGAL_UPDATED,
    backLabel: signedIn ? 'Volver a Parla' : 'Volver',
    back: () => (window.history.length > 1 ? navigate(-1) : navigate(signedIn ? '/app' : '/entrar')),
  };
}
