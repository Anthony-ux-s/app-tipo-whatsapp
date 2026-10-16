const timeFormat = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' });
const weekdayFormat = new Intl.DateTimeFormat('es-CO', { weekday: 'long' });
const shortDateFormat = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' });
const longDateFormat = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Días calendario entre dos fechas (0 = mismo día). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY);
}

export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Hora si es de hoy, "Ayer", el día de la semana o la fecha corta, como en la lista de chats. */
export function formatListTimestamp(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const diff = daysBetween(date, now);
  if (diff <= 0) return timeFormat.format(date);
  if (diff === 1) return 'Ayer';
  if (diff < 7) return capitalize(weekdayFormat.format(date));
  return shortDateFormat.format(date);
}

/** Separador de día dentro de la conversación. */
export function formatDayLabel(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const diff = daysBetween(date, now);
  if (diff <= 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  if (diff < 7) return capitalize(weekdayFormat.format(date));
  return longDateFormat.format(date);
}

/** "en línea", "últ. vez hoy a las 9:40 a. m.", etc. */
export function formatLastSeen(iso: string | null, now = new Date()): string {
  if (!iso) return 'desconectado';
  const date = new Date(iso);
  const diff = daysBetween(date, now);
  if (diff <= 0) return `últ. vez hoy a las ${timeFormat.format(date)}`;
  if (diff === 1) return `últ. vez ayer a las ${timeFormat.format(date)}`;
  return `últ. vez el ${shortDateFormat.format(date)}`;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export type DueTone = 'overdue' | 'today' | 'soon' | 'later' | 'done';

/** Etiqueta de la fecha límite de una tarea ("Vence hoy", "Venció el 12 oct.", "Mañana"…). */
export function formatDue(dueDate: string | null, done: boolean, now = new Date()): { label: string; tone: DueTone } | null {
  if (!dueDate) return null;
  const [y, m, d] = dueDate.split('-').map(Number);
  const due = new Date(y, m - 1, d);
  const diff = daysBetween(now, due);
  const short = shortDateFormat.format(due);
  if (done) return { label: short, tone: 'done' };
  if (diff < 0) return { label: `Venció el ${short}`, tone: 'overdue' };
  if (diff === 0) return { label: 'Vence hoy', tone: 'today' };
  if (diff === 1) return { label: 'Mañana', tone: 'soon' };
  if (diff < 7) return { label: capitalize(weekdayFormat.format(due)), tone: 'soon' };
  return { label: short, tone: 'later' };
}

/** Fecha local de hoy en formato AAAA-MM-DD (para los campos de fecha). */
export function todayIso(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
