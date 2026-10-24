import type { CallKind, ConversationSummary } from '@parla/types';
import { ArrowLeft, Info, Lock, Phone, Video } from 'lucide-react';
import { Avatar } from '@shared/ui/Avatar';
import { IconButton } from '@shared/ui/Button';

interface ConversationHeaderProps {
  conversation: ConversationSummary;
  subtitle: string;
  typing: string | null;
  online: boolean;
  callBusy: boolean;
  onCall: (kind: CallKind) => void;
  onBack: () => void;
  onOpenInfo: () => void;
}

export function ConversationHeader({ conversation, subtitle, typing, online, callBusy, onCall, onBack, onOpenInfo }: ConversationHeaderProps) {
  return (
    <header className="z-10 flex h-16 shrink-0 items-center gap-1 border-b border-line bg-surface px-1.5 shadow-float md:gap-3 md:px-4">
      <IconButton label="Volver a los chats" onClick={onBack} className="md:hidden">
        <ArrowLeft className="size-5" />
      </IconButton>
      <button type="button" onClick={onOpenInfo} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-1 pr-2 text-left">
        <Avatar name={conversation.title} color={conversation.avatarColor} photo={conversation.avatarUrl} group={conversation.kind === 'group'} online={online} size="sm" />
        <span className="min-w-0">
          <span className="block truncate font-display text-[15px] font-bold text-ink" data-testid="conversation-title">
            {conversation.title}
          </span>
          <span className={`block truncate text-[11px] ${typing ? 'font-medium text-emerald-600 dark:text-emerald-400' : 'text-ink-soft'}`}>
            {typing ?? subtitle}
          </span>
        </span>
      </button>
      <span className="hidden items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-ink xl:flex dark:bg-teal-950/60 dark:text-ink">
        <Lock className="size-3" /> Cifrado E2E
      </span>
      <IconButton label="Videollamada" onClick={() => onCall('video')} disabled={callBusy}>
        <Video className="size-5" />
      </IconButton>
      <IconButton label="Llamada de voz" onClick={() => onCall('audio')} disabled={callBusy}>
        <Phone className="size-5" />
      </IconButton>
      <IconButton label="Información del chat" onClick={onOpenInfo} className="hidden sm:inline-flex">
        <Info className="size-5" />
      </IconButton>
    </header>
  );
}
