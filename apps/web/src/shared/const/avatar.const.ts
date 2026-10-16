/** Degradados de avatar dentro de la paleta corporativa (teal, emerald, cyan). */
export const AVATAR_GRADIENTS: Record<string, string> = {
  teal: 'from-teal-400 to-teal-600',
  emerald: 'from-emerald-400 to-emerald-600',
  cyan: 'from-cyan-400 to-cyan-600',
  'teal-dark': 'from-teal-600 to-teal-800',
  'emerald-dark': 'from-emerald-600 to-teal-800',
  'cyan-dark': 'from-cyan-600 to-teal-700',
};

export const AVATAR_COLOR_OPTIONS = Object.keys(AVATAR_GRADIENTS);

export const AVATAR_COLOR_LABELS: Record<string, string> = {
  teal: 'Teal',
  emerald: 'Esmeralda',
  cyan: 'Cian',
  'teal-dark': 'Teal profundo',
  'emerald-dark': 'Bosque',
  'cyan-dark': 'Océano',
};
