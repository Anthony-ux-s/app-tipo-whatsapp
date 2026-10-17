import { LIVE_STICKERS, type PhraseStyle } from '@shared/const/stickers.const';
import type { StickerRef } from '@shared/utils/sticker-codec';
import { PaliSticker } from './PaliSticker';

const PHRASE_CLASSES: Record<PhraseStyle, string> = {
  sol: 'bg-gradient-to-br from-amber-300 to-orange-500 text-white -rotate-3',
  menta: 'bg-gradient-to-br from-teal-300 to-emerald-600 text-white rotate-2',
  cielo: 'bg-gradient-to-br from-sky-400 to-indigo-500 text-white -rotate-2',
  rosa: 'bg-gradient-to-br from-pink-400 to-rose-600 text-white rotate-3',
  noche: 'bg-gradient-to-br from-slate-800 to-violet-900 text-amber-200 -rotate-2',
  comic: 'bg-yellow-300 text-slate-900 rotate-2 [clip-path:polygon(50%_0,61%_14%,79%_6%,80%_24%,99%_25%,88%_42%,100%_56%,83%_65%,88%_86%,68%_82%,57%_100%,46%_85%,27%_96%,23%_77%,3%_75%,13%_57%,0_40%,17%_31%,15%_10%,35%_15%)]',
};

/** Tamaño de letra según el largo, para que la frase quepa sin cortarse. */
function phraseSize(text: string, compact: boolean) {
  const sizes = compact ? ['text-[19px]', 'text-[15px]', 'text-[12px]', 'text-[10px]'] : ['text-[26px]', 'text-[21px]', 'text-[17px]', 'text-[14px]'];
  if (text.length <= 8) return sizes[0];
  if (text.length <= 16) return sizes[1];
  if (text.length <= 26) return sizes[2];
  return sizes[3];
}

export function PhraseSticker({ text, style, className = '' }: { text: string; style: PhraseStyle; className?: string }) {
  const comic = style === 'comic';
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div
        className={`flex items-center justify-center text-center leading-tight font-black drop-shadow-[0_6px_10px_rgba(15,23,42,0.25)] ${PHRASE_CLASSES[style]} ${
          comic ? 'aspect-square w-[96%] p-[20%]' : 'max-w-[92%] rounded-[22px] border-[5px] border-white px-4 py-3 [overflow-wrap:anywhere]'
        } ${phraseSize(text, comic)} stk-pop`}
        style={comic ? undefined : { textShadow: '0 2px 0 rgba(0,0,0,0.18)' }}
      >
        <span className="line-clamp-3">{text}</span>
      </div>
    </div>
  );
}

export function LiveSticker({ id, className = '' }: { id: string; className?: string }) {
  const sticker = LIVE_STICKERS.find((s) => s.id === id);
  if (!sticker) return null;
  return (
    <div className={`stk-live-box flex items-center justify-center ${className}`} role="img" aria-label={`Sticker ${sticker.emoji}`}>
      <span className={`stk-live stk-live-${sticker.animation} select-none leading-none`}>{sticker.emoji}</span>
    </div>
  );
}

/** Dibuja cualquier sticker; si no se pudo leer (versión más nueva u otro problema) muestra un aviso. */
export function Sticker({ sticker, className = '' }: { sticker: StickerRef | null | undefined; className?: string }) {
  if (!sticker) {
    return <div className={`flex items-center justify-center rounded-2xl bg-black/5 text-xs text-ink-soft dark:bg-white/5 ${className}`}>Sticker</div>;
  }
  if (sticker.pack === 'pali') return <PaliSticker mood={sticker.id} className={className} />;
  if (sticker.pack === 'vivos') return <LiveSticker id={sticker.id} className={className} />;
  return <PhraseSticker text={sticker.text} style={sticker.style} className={className} />;
}
