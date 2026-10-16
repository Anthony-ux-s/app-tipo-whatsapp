import { Users } from 'lucide-react';
import { AVATAR_GRADIENTS } from '../const/avatar.const';
import { initials } from '../utils/text';

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZES: Record<Size, string> = {
  xs: 'size-7 text-[11px]',
  sm: 'size-9 text-xs',
  md: 'size-12 text-sm',
  lg: 'size-14 text-base',
  xl: 'size-24 text-3xl',
};

const DOT: Record<Size, string> = {
  xs: 'size-2.5',
  sm: 'size-3',
  md: 'size-3.5',
  lg: 'size-4',
  xl: 'size-5',
};

interface AvatarProps {
  name: string;
  color: string;
  size?: Size;
  online?: boolean;
  group?: boolean;
  className?: string;
}

export function Avatar({ name, color, size = 'md', online = false, group = false, className = '' }: AvatarProps) {
  return (
    <span className={`relative inline-flex shrink-0 ${className}`}>
      <span
        className={`inline-flex items-center justify-center rounded-full bg-gradient-to-br font-display font-bold text-white select-none ${AVATAR_GRADIENTS[color] ?? AVATAR_GRADIENTS.teal} ${SIZES[size]}`}
        aria-hidden="true"
      >
        {group ? <Users className="size-1/2" strokeWidth={2} /> : initials(name)}
      </span>
      {online && (
        <span
          className={`absolute right-0 bottom-0 rounded-full bg-emerald-500 ring-2 ring-surface ${DOT[size]}`}
          aria-label="En línea"
        />
      )}
    </span>
  );
}
