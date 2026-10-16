import { normalizeSearch } from '@shared/utils/text';

export interface MentionCandidate {
  id: string;
  displayName: string;
}

export interface MentionQuery {
  /** Posición de la @ en el texto. */
  start: number;
  query: string;
}

/** Si el cursor está escribiendo una mención ("hola @and|"), devuelve lo que se busca. */
export function findMentionQuery(text: string, caret: number): MentionQuery | null {
  const before = text.slice(0, caret);
  const match = before.match(/(^|\s)@([\p{L}\d._]*)$/u);
  if (!match) return null;
  return { start: before.length - match[2].length - 1, query: match[2] };
}

export function filterCandidates(candidates: MentionCandidate[], query: string, limit = 6): MentionCandidate[] {
  const q = normalizeSearch(query);
  return candidates
    .filter((c) => normalizeSearch(c.displayName).split(/\s+/).some((part) => part.startsWith(q)) || normalizeSearch(c.displayName).startsWith(q))
    .slice(0, limit);
}

/** Reemplaza "@consulta" por "@Nombre Completo " y devuelve el nuevo texto y la posición del cursor. */
export function insertMention(text: string, mention: MentionQuery, caret: number, name: string): { text: string; caret: number } {
  const inserted = `@${name} `;
  const next = text.slice(0, mention.start) + inserted + text.slice(caret);
  return { text: next, caret: mention.start + inserted.length };
}

/** Personas cuyo "@Nombre" sigue en el texto final (por si se borró la mención antes de enviar). */
export function collectMentions(text: string, candidates: MentionCandidate[]): string[] {
  return candidates.filter((c) => text.includes(`@${c.displayName}`)).map((c) => c.id);
}

export type TextSegment = { text: string; mention: null } | { text: string; mention: { id: string; self: boolean } };

/** Parte el texto para resaltar las menciones (las más largas primero, para no cortar nombres). */
export function segmentMentions(text: string, mentioned: MentionCandidate[], myId: string): TextSegment[] {
  const names = [...mentioned].sort((a, b) => b.displayName.length - a.displayName.length);
  if (names.length === 0) return [{ text, mention: null }];
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`@(${names.map((n) => escape(n.displayName)).join('|')})`, 'g');
  const segments: TextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ text: text.slice(last, index), mention: null });
    const person = names.find((n) => n.displayName === match[1])!;
    segments.push({ text: match[0], mention: { id: person.id, self: person.id === myId } });
    last = index + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), mention: null });
  return segments;
}
