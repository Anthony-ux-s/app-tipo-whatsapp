import { Lock } from 'lucide-react';
import { SelectChatIllustration } from '@shared/ui/illustrations';

/** Panel principal en escritorio cuando no hay conversación abierta. */
export function NoChatSelected() {
  return (
    <div className="relative hidden flex-1 flex-col items-center justify-center border-b-[6px] border-emerald-500 bg-surface-2 px-8 text-center md:flex">
      <div className="w-full max-w-md animate-fade-in">
        <SelectChatIllustration />
        <h2 className="mt-6 text-2xl font-extrabold text-ink lg:text-3xl">Parla para equipos</h2>
        <p className="mt-2 text-[15px] text-ink-soft">
          Elige una conversación para empezar, o crea un grupo para tu proyecto. Tus chats se sincronizan en el celular y en el computador.
        </p>
      </div>
      <p className="absolute bottom-8 flex items-center gap-1.5 text-xs text-ink-faint">
        <Lock className="size-3.5" /> Cifrado de extremo a extremo
      </p>
    </div>
  );
}
