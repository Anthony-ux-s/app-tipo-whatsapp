import { useEffect, useRef } from 'react';

interface OtpCredential extends Credential {
  code: string;
}

/**
 * WebOTP: en Android con Chrome, al llegar el SMS («… @parla.app #123456») el navegador ofrece
 * completar el código con un toque. En los demás navegadores no hace nada.
 */
export function useSmsAutofill(active: boolean, onCode: (code: string) => void) {
  const callback = useRef(onCode);
  callback.current = onCode;

  useEffect(() => {
    if (!active || !('OTPCredential' in window)) return;
    const controller = new AbortController();
    navigator.credentials
      .get({ otp: { transport: ['sms'] }, signal: controller.signal } as CredentialRequestOptions)
      .then((credential) => {
        const code = (credential as OtpCredential | null)?.code;
        if (code) callback.current(code);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [active]);
}
