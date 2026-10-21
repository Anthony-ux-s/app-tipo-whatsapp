/** Día calendario en Lima (AAAA-MM-DD): el tráfico se cuenta por día local, no UTC. */
const LIMA_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' });

export function limaDay(at: Date): string {
  return LIMA_DAY.format(at);
}

/** Los últimos `count` días (el más viejo primero), terminando hoy. */
export function lastDays(now: Date, count: number): string[] {
  return Array.from({ length: count }, (_, i) => limaDay(new Date(now.getTime() - (count - 1 - i) * 86_400_000)));
}
