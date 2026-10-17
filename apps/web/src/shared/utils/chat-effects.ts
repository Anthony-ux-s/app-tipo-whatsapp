import type { ChatEffect } from '../const/stickers.const';

const RULES: { effect: ChatEffect; pattern: RegExp }[] = [
  {
    effect: 'confetti',
    pattern: /feliz cumple|felicidades|felicitaciones|feliz ano nuevo|lo logramos|lo logre|🎉|🥳|🎂|🎊/u,
  },
  { effect: 'hearts', pattern: /\bte (quiero|amo|extrano)\b|❤|😍|🥰|💕|💖|😘/u },
  { effect: 'laugh', pattern: /(ja){3,}|(je){3,}|(ha){3,}|😂|🤣/u },
  { effect: 'stars', pattern: /buenas noches|feliz navidad|✨|🌙|⭐/u },
];

/**
 * Efecto que dispara un texto. Se calcula en el navegador con el mensaje ya descifrado: el servidor no
 * participa ni se entera.
 */
export function detectEffect(text: string): ChatEffect | null {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return RULES.find((rule) => rule.pattern.test(normalized))?.effect ?? null;
}
