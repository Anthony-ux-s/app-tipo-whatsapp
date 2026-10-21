import type { ChatFont, ChatFontSize } from '@parla/types';

/** Tamaño de la letra de los mensajes, en el orden en que se ofrece en Ajustes → Chats. */
export const CHAT_FONT_SIZES: Record<ChatFontSize, string> = {
  small: '13px',
  medium: '15px',
  large: '17px',
  xlarge: '20px',
};

export const CHAT_FONT_SIZE_OPTIONS: { id: ChatFontSize; label: string }[] = [
  { id: 'small', label: 'Pequeña' },
  { id: 'medium', label: 'Normal' },
  { id: 'large', label: 'Grande' },
  { id: 'xlarge', label: 'Muy grande' },
];

/** Tipos de letra de los mensajes (Inter y Plus Jakarta ya se cargan; los otros son del sistema). */
export const CHAT_FONT_FAMILIES: Record<ChatFont, string> = {
  inter: "'Inter', ui-sans-serif, system-ui, sans-serif",
  jakarta: "'Plus Jakarta Sans', 'Inter', ui-sans-serif, sans-serif",
  serif: "Georgia, 'Times New Roman', ui-serif, serif",
  mono: "ui-monospace, 'Cascadia Mono', Consolas, monospace",
};

export const CHAT_FONT_OPTIONS: { id: ChatFont; label: string }[] = [
  { id: 'inter', label: 'Moderna' },
  { id: 'jakarta', label: 'Redondeada' },
  { id: 'serif', label: 'Clásica' },
  { id: 'mono', label: 'Máquina de escribir' },
];
