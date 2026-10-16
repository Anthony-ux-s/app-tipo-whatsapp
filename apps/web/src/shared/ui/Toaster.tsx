import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { useToastStore } from '../stores/toast.store';

const ICONS = {
  info: <Info className="size-5 text-cyan-300" />,
  success: <CheckCircle2 className="size-5 text-emerald-300" />,
  error: <TriangleAlert className="size-5 text-cyan-200" />,
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto flex w-full max-w-sm animate-rise items-center gap-3 rounded-xl bg-teal-950 px-4 py-3 text-sm text-white shadow-pop"
        >
          {ICONS[t.tone]}
          <span className="flex-1">{t.message}</span>
          <button type="button" onClick={() => dismiss(t.id)} aria-label="Cerrar aviso" className="text-white/60 hover:text-white">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
