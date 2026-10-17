/** Montos en céntimos → «S/ 4.50» (soles peruanos, como Yape). */
export function formatSoles(cents: number): string {
  return `S/ ${(cents / 100).toFixed(2)}`;
}

export function formatLongDate(iso: string): string {
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
}
