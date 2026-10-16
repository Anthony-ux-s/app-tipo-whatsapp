/** Colores de avatar dentro de la paleta corporativa (teal, emerald, cyan). */
export const AVATAR_COLORS = [
  'teal',
  'emerald',
  'cyan',
  'teal-dark',
  'emerald-dark',
  'cyan-dark',
] as const;

export function pickAvatarColor(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function isAvatarColor(value: string): boolean {
  return (AVATAR_COLORS as readonly string[]).includes(value);
}
