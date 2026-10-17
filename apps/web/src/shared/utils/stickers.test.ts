import { describe, expect, it } from 'vitest';
import { detectEffect } from './chat-effects';
import { decodeSticker, encodeSticker, stickerEffect, stickerLabel } from './sticker-codec';

describe('stickers cifrados', () => {
  it('ida y vuelta de cada tipo de sticker', () => {
    expect(decodeSticker(encodeSticker({ pack: 'pali', id: 'hola' }))).toEqual({ pack: 'pali', id: 'hola' });
    expect(decodeSticker(encodeSticker({ pack: 'vivos', id: 'corazon' }))).toEqual({ pack: 'vivos', id: 'corazon' });
    expect(decodeSticker(encodeSticker({ pack: 'frase', text: '  ¡Ya   llegué!  ', style: 'sol' }))).toEqual({ pack: 'frase', text: '¡Ya llegué!', style: 'sol' });
  });

  it('rechaza contenido desconocido o malformado sin romperse', () => {
    expect(decodeSticker('hola')).toBeNull();
    expect(decodeSticker('{"pack":"pali","id":"no-existe"}')).toBeNull();
    expect(decodeSticker('{"pack":"frase","text":"   ","style":"sol"}')).toBeNull();
    expect(decodeSticker('{"pack":"frase","text":"hola","style":"<script>"}')).toBeNull();
    expect(decodeSticker('null')).toBeNull();
  });

  it('recorta las frases largas', () => {
    const long = 'a'.repeat(100);
    const sticker = decodeSticker(encodeSticker({ pack: 'frase', text: long, style: 'menta' }));
    expect(sticker?.pack === 'frase' && sticker.text.length).toBe(40);
  });

  it('etiqueta legible y efecto', () => {
    expect(stickerLabel({ pack: 'pali', id: 'te-quiero' })).toBe('Sticker «Te quiero»');
    expect(stickerLabel({ pack: 'vivos', id: 'tada' })).toBe('Sticker 🎉');
    expect(stickerLabel(null)).toBe('Sticker');
    expect(stickerEffect({ pack: 'pali', id: 'fiesta' })).toBe('confetti');
    expect(stickerEffect({ pack: 'pali', id: 'hola' })).toBeNull();
  });
});

describe('efectos del chat', () => {
  it('reconoce frases sin importar mayúsculas ni tildes', () => {
    expect(detectEffect('¡Feliz cumpleaños, Laura!')).toBe('confetti');
    expect(detectEffect('FELICIDADES')).toBe('confetti');
    expect(detectEffect('Te extraño mucho')).toBe('hearts');
    expect(detectEffect('jajajaja qué bueno')).toBe('laugh');
    expect(detectEffect('Buenas noches a todos')).toBe('stars');
    expect(detectEffect('Listo 🎉')).toBe('confetti');
  });

  it('no se dispara con texto normal', () => {
    expect(detectEffect('¿Confirmas la ruta del jueves?')).toBeNull();
    expect(detectEffect('ja')).toBeNull();
    expect(detectEffect('Quiero el informe')).toBeNull();
  });
});
