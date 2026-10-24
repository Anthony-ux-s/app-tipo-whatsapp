/**
 * Ejecuta `task` cuando el navegador está libre (o a más tardar tras `timeoutMs`), para no competir con
 * lo que la persona ve primero. Devuelve cómo cancelarlo.
 */
export function whenIdle(task: () => void, timeoutMs = 2000): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(task, { timeout: timeoutMs });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(task, Math.min(timeoutMs, 500));
  return () => window.clearTimeout(id);
}
