import {
  LIVE_STICKERS,
  PALI_STICKERS,
  PHRASE_MAX_LENGTH,
  PHRASE_STYLES,
  type ChatEffect,
  type PaliMood,
  type PhraseStyle,
} from '../const/stickers.const';

/**
 * Qué sticker es. Viaja cifrado de extremo a extremo dentro del mensaje (como el texto), así que el
 * servidor solo sabe que es «un sticker», nunca cuál ni qué frase lleva.
 */
export type StickerRef =
  | { pack: 'pali'; id: PaliMood }
  | { pack: 'vivos'; id: string }
  | { pack: 'frase'; text: string; style: PhraseStyle };

export function encodeSticker(sticker: StickerRef): string {
  return JSON.stringify({ v: 1, ...sticker });
}

/** Lee el contenido descifrado; si no es un sticker conocido (versión nueva, datos raros) devuelve null. */
export function decodeSticker(raw: string): StickerRef | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const { pack, id, text, style } = data as Record<string, unknown>;
  if (pack === 'pali' && PALI_STICKERS.some((s) => s.id === id)) return { pack, id: id as PaliMood };
  if (pack === 'vivos' && LIVE_STICKERS.some((s) => s.id === id)) return { pack, id: id as string };
  if (pack === 'frase' && typeof text === 'string' && PHRASE_STYLES.some((s) => s.id === style)) {
    const clean = cleanPhrase(text);
    if (clean) return { pack, text: clean, style: style as PhraseStyle };
  }
  return null;
}

/** Una línea, sin espacios repetidos y con el largo máximo. */
export function cleanPhrase(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, PHRASE_MAX_LENGTH);
}

/** Texto para la lista de chats, las citas y los avisos: «Sticker «¡Hola!»». */
export function stickerLabel(sticker: StickerRef | null): string {
  if (!sticker) return 'Sticker';
  if (sticker.pack === 'pali') return `Sticker «${PALI_STICKERS.find((s) => s.id === sticker.id)?.caption ?? ''}»`;
  if (sticker.pack === 'vivos') return `Sticker ${LIVE_STICKERS.find((s) => s.id === sticker.id)?.emoji ?? ''}`;
  return `Sticker «${sticker.text}»`;
}

export function stickerEffect(sticker: StickerRef | null): ChatEffect | null {
  if (!sticker) return null;
  if (sticker.pack === 'pali') return PALI_STICKERS.find((s) => s.id === sticker.id)?.effect ?? null;
  if (sticker.pack === 'vivos') return LIVE_STICKERS.find((s) => s.id === sticker.id)?.effect ?? null;
  return null;
}
