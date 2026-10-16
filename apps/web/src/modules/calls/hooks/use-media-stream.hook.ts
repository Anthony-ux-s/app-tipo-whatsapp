import { useCallback, useEffect, useRef } from 'react';

/** Conecta un MediaStream a un <video>/<audio> (srcObject no se puede pasar como atributo). */
export function useMediaStream<T extends HTMLMediaElement>(stream: MediaStream | null) {
  const element = useRef<T | null>(null);

  useEffect(() => {
    const el = element.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (stream) void el.play().catch(() => undefined);
  }, [stream]);

  return useCallback(
    (el: T | null) => {
      element.current = el;
      if (el && el.srcObject !== stream) {
        el.srcObject = stream;
        if (stream) void el.play().catch(() => undefined);
      }
    },
    [stream],
  );
}
