/** Efectos a pantalla completa que puede disparar un mensaje o un sticker. */
export type ChatEffect = 'confetti' | 'hearts' | 'laugh' | 'stars';

export type PaliMood =
  | 'hola'
  | 'gracias'
  | 'jaja'
  | 'te-quiero'
  | 'listo'
  | 'fiesta'
  | 'en-camino'
  | 'triste'
  | 'sorpresa'
  | 'buenos-dias'
  | 'buenas-noches'
  | 'pensando';

/** Pali, el loro de Parla (un loro habla: «parla»). Arte propio, dibujado en SVG. */
export const PALI_STICKERS: { id: PaliMood; caption: string; effect?: ChatEffect }[] = [
  { id: 'hola', caption: '¡Hola!' },
  { id: 'gracias', caption: '¡Gracias!' },
  { id: 'jaja', caption: '¡Jajaja!', effect: 'laugh' },
  { id: 'te-quiero', caption: 'Te quiero', effect: 'hearts' },
  { id: 'listo', caption: '¡Listo!' },
  { id: 'fiesta', caption: '¡A celebrar!', effect: 'confetti' },
  { id: 'en-camino', caption: '¡Voy en camino!' },
  { id: 'triste', caption: 'Snif…' },
  { id: 'sorpresa', caption: '¿¡Qué!?' },
  { id: 'buenos-dias', caption: 'Buenos días' },
  { id: 'buenas-noches', caption: 'Buenas noches', effect: 'stars' },
  { id: 'pensando', caption: 'Mmm…' },
];

export type LiveAnimation = 'beat' | 'shake' | 'flicker' | 'pop' | 'burst' | 'bow' | 'bounce' | 'gasp' | 'wave' | 'pulse' | 'launch' | 'spin';

/** Emojis grandes y animados. */
export const LIVE_STICKERS: { id: string; emoji: string; animation: LiveAnimation; effect?: ChatEffect }[] = [
  { id: 'corazon', emoji: '❤️', animation: 'beat', effect: 'hearts' },
  { id: 'risa', emoji: '😂', animation: 'shake', effect: 'laugh' },
  { id: 'fuego', emoji: '🔥', animation: 'flicker' },
  { id: 'like', emoji: '👍', animation: 'pop' },
  { id: 'tada', emoji: '🎉', animation: 'burst', effect: 'confetti' },
  { id: 'porfa', emoji: '🙏', animation: 'bow' },
  { id: 'enamorado', emoji: '😍', animation: 'bounce', effect: 'hearts' },
  { id: 'asombro', emoji: '😮', animation: 'gasp' },
  { id: 'fiesta', emoji: '🥳', animation: 'burst', effect: 'confetti' },
  { id: 'saludo', emoji: '👋', animation: 'wave' },
  { id: 'cien', emoji: '💯', animation: 'pulse' },
  { id: 'cohete', emoji: '🚀', animation: 'launch' },
];

export type PhraseStyle = 'sol' | 'menta' | 'noche' | 'rosa' | 'comic' | 'cielo';

/** Estilos del sticker con tu propia frase. */
export const PHRASE_STYLES: { id: PhraseStyle; label: string; swatch: string }[] = [
  { id: 'sol', label: 'Sol', swatch: 'linear-gradient(135deg,#fbbf24,#f97316)' },
  { id: 'menta', label: 'Menta', swatch: 'linear-gradient(135deg,#2dd4bf,#059669)' },
  { id: 'cielo', label: 'Cielo', swatch: 'linear-gradient(135deg,#38bdf8,#6366f1)' },
  { id: 'rosa', label: 'Rosa', swatch: 'linear-gradient(135deg,#f472b6,#e11d48)' },
  { id: 'noche', label: 'Noche', swatch: 'linear-gradient(135deg,#1e293b,#4c1d95)' },
  { id: 'comic', label: 'Cómic', swatch: '#fde047' },
];

export const PHRASE_MAX_LENGTH = 40;

/** Frases listas para tocar y enviar (también se puede escribir la propia). */
export const PHRASE_SUGGESTIONS = ['¡Buenísimo!', '¡Ya llegué!', '¿Almorzamos?', '¡Vamos!', 'Te extraño', '¡Qué orgullo!'];
