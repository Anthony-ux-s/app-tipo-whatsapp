import { SendHorizontal, Smile, Sparkles, Type } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  LIVE_STICKERS,
  PALI_STICKERS,
  PHRASE_MAX_LENGTH,
  PHRASE_STYLES,
  PHRASE_SUGGESTIONS,
  type PhraseStyle,
} from '@shared/const/stickers.const';
import { cleanPhrase, type StickerRef } from '@shared/utils/sticker-codec';
import { PaliSticker } from './PaliSticker';
import { LiveSticker, PhraseSticker } from './Sticker';

type Tab = 'emoji' | 'pali' | 'vivos' | 'frase';

const TAB_KEY = 'parla.stickerTab';

function readTab(): Tab {
  try {
    const saved = localStorage.getItem(TAB_KEY);
    if (saved === 'emoji' || saved === 'pali' || saved === 'vivos' || saved === 'frase') return saved;
  } catch {
    // Sin almacenamiento (modo privado): se abre en emojis.
  }
  return 'emoji';
}

interface StickerPickerProps {
  emojis: string[];
  onEmoji: (emoji: string) => void;
  onSticker: (sticker: StickerRef) => void;
}

/** Panel de expresiones: emojis, Pali (el loro de Parla), emojis animados y stickers con tu frase. */
export function StickerPicker({ emojis, onEmoji, onSticker }: StickerPickerProps) {
  const [tab, setTab] = useState<Tab>(readTab);
  const [phrase, setPhrase] = useState('');
  const [style, setStyle] = useState<PhraseStyle>('sol');
  const choose = (next: Tab) => {
    setTab(next);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      // Recordar la pestaña es solo una comodidad.
    }
  };
  const clean = cleanPhrase(phrase);

  const tabs: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: 'emoji', label: 'Emojis', icon: <Smile className="size-[18px]" /> },
    { id: 'pali', label: 'Pali', icon: <PaliSticker mood="hola" withCaption={false} className="size-6" /> },
    { id: 'vivos', label: 'Animados', icon: <Sparkles className="size-[18px]" /> },
    { id: 'frase', label: 'Tu frase', icon: <Type className="size-[18px]" /> },
  ];

  return (
    <div
      className="absolute bottom-full left-2 z-20 mb-2 flex w-[min(360px,calc(100vw-1rem))] animate-rise flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-pop md:left-4"
      data-testid="sticker-picker"
    >
      <div role="tablist" aria-label="Expresiones" className="flex border-b border-line px-1.5 pt-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => choose(t.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-t-lg border-b-2 px-1 py-2 text-xs font-semibold transition-colors duration-150 ${
              tab === t.id ? 'border-brand text-brand dark:border-teal-300 dark:text-teal-300' : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="max-h-[320px] overflow-y-auto p-2">
        {tab === 'emoji' && (
          <div className="grid grid-cols-8 gap-1">
            {emojis.map((emoji) => (
              <button key={emoji} type="button" onClick={() => onEmoji(emoji)} className="flex aspect-square items-center justify-center rounded-lg text-[22px] transition-transform duration-150 hover:scale-110 hover:bg-surface-3" aria-label={`Emoji ${emoji}`}>
                {emoji}
              </button>
            ))}
          </div>
        )}

        {tab === 'pali' && (
          <>
            <p className="px-1 pb-2 text-xs text-ink-soft">Pali, el loro de Parla. Toca uno para enviarlo.</p>
            <div className="grid grid-cols-4 gap-1">
              {PALI_STICKERS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSticker({ pack: 'pali', id: s.id })}
                  aria-label={`Enviar sticker ${s.caption}`}
                  data-testid={`sticker-pali-${s.id}`}
                  className="rounded-xl p-1 transition-transform duration-150 hover:scale-105 hover:bg-surface-2 active:scale-95"
                >
                  <PaliSticker mood={s.id} className="aspect-square w-full" />
                </button>
              ))}
            </div>
          </>
        )}

        {tab === 'vivos' && (
          <div className="grid grid-cols-4 gap-1">
            {LIVE_STICKERS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onSticker({ pack: 'vivos', id: s.id })}
                aria-label={`Enviar sticker ${s.emoji}`}
                className="rounded-xl p-1 transition-transform duration-150 hover:scale-105 hover:bg-surface-2 active:scale-95"
              >
                <LiveSticker id={s.id} className="aspect-square w-full" />
              </button>
            ))}
          </div>
        )}

        {tab === 'frase' && (
          <form
            className="flex flex-col gap-3 p-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (!clean) return;
              onSticker({ pack: 'frase', text: clean, style });
              setPhrase('');
            }}
          >
            <div className="flex h-36 items-center justify-center rounded-xl bg-surface-2">
              <PhraseSticker key={`${style}-${clean}`} text={clean || 'Tu frase aquí'} style={style} className="size-32" />
            </div>
            <div className="flex gap-2">
              <input
                value={phrase}
                maxLength={PHRASE_MAX_LENGTH}
                onChange={(e) => setPhrase(e.target.value)}
                placeholder="Escribe tu frase"
                aria-label="Frase del sticker"
                className="h-10 min-w-0 flex-1 rounded-full border border-line bg-surface px-4 text-sm text-ink outline-none placeholder:text-ink-faint/60 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
              />
              <button
                type="submit"
                disabled={!clean}
                aria-label="Enviar sticker con tu frase"
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand text-white transition-transform duration-150 active:scale-95 disabled:opacity-40"
              >
                <SendHorizontal className="size-4" />
              </button>
            </div>
            <div className="flex items-center gap-2" role="radiogroup" aria-label="Estilo">
              {PHRASE_STYLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={style === s.id}
                  aria-label={s.label}
                  title={s.label}
                  onClick={() => setStyle(s.id)}
                  style={{ background: s.swatch }}
                  className={`size-7 rounded-full border-2 transition-transform duration-150 ${style === s.id ? 'scale-110 border-ink' : 'border-white shadow-float'}`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PHRASE_SUGGESTIONS.map((p) => (
                <button key={p} type="button" onClick={() => setPhrase(p)} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-soft hover:bg-surface-3 hover:text-ink">
                  {p}
                </button>
              ))}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
