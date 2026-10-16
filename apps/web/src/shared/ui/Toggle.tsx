interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, description, disabled = false }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-[var(--radius-card)] px-1 py-2 text-left disabled:opacity-60"
    >
      <span className="flex flex-col">
        <span className="text-[15px] font-medium text-ink">{label}</span>
        {description && <span className="text-sm text-ink-soft">{description}</span>}
      </span>
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out ${checked ? 'bg-brand' : 'bg-surface-3 ring-1 ring-line'}`}
      >
        <span
          className={`inline-block size-5 rounded-full bg-white shadow-float transition-transform duration-200 ease-in-out ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
        />
      </span>
    </button>
  );
}
