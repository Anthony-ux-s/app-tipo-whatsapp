import { initials } from '../utils/text';

const COLORS: Record<string, string> = {
  teal: 'from-teal-500 to-teal-700',
  emerald: 'from-emerald-500 to-teal-700',
  cyan: 'from-cyan-500 to-teal-700',
};

interface WorkspaceBadgeProps {
  name: string;
  color: string;
  size?: 'sm' | 'md';
  active?: boolean;
}

export function WorkspaceBadge({ name, color, size = 'md', active = false }: WorkspaceBadgeProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center bg-gradient-to-br font-display font-extrabold text-white transition-all duration-200 ease-in-out ${COLORS[color] ?? COLORS.teal} ${size === 'sm' ? 'size-8 rounded-lg text-xs' : `size-11 text-sm ${active ? 'rounded-xl' : 'rounded-2xl'}`}`}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
