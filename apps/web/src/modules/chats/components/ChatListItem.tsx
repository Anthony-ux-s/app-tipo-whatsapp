import { AtSign, Camera, Mic, Sticker, Video } from 'lucide-react';
import { Avatar } from '@shared/ui/Avatar';
import type { ChatListEntry } from '../types/chats.types';
import { DeliveryTicks } from './DeliveryTicks';

interface ChatListItemProps {
  entry: ChatListEntry;
  active: boolean;
  onOpen: (id: string) => void;
}

const MEDIA_ICON = {
  image: <Camera className="size-4 shrink-0" />,
  audio: <Mic className="size-4 shrink-0" />,
  video: <Video className="size-4 shrink-0" />,
  sticker: <Sticker className="size-4 shrink-0" />,
};

export function ChatListItem({ entry, active, onOpen }: ChatListItemProps) {
  const { conversation, preview, typing, online, mine } = entry;
  const unread = conversation.unreadCount > 0;
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(conversation.id)}
        aria-current={active ? 'page' : undefined}
        data-testid="chat-item"
        className={`group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-200 ease-in-out md:px-4 ${active ? 'bg-teal-50 dark:bg-teal-950/50' : 'hover:bg-surface-2'}`}
      >
        <Avatar name={conversation.title} color={conversation.avatarColor} photo={conversation.avatarUrl} group={conversation.kind === 'group'} online={online} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 border-b border-line py-1 group-last:border-transparent">
          <span className="flex items-baseline justify-between gap-2">
            <span className={`truncate text-[14px] text-ink ${unread ? 'font-bold' : 'font-semibold'}`}>{conversation.title}</span>
            <span className={`shrink-0 text-[11px] ${unread ? 'font-semibold text-blue-600 dark:text-blue-400' : 'text-ink-faint'}`}>
              {entry.time}
            </span>
          </span>
          <span className="flex items-center justify-between gap-2">
            {typing ? (
              <span className="truncate text-[13px] font-medium text-blue-600 dark:text-blue-400">{typing}</span>
            ) : (
              // Hasta dos renglones del último mensaje; si hay algo sin leer, en azul y más marcado.
              <span className={`min-w-0 text-[13px] leading-snug break-words line-clamp-2 ${unread ? 'font-semibold text-blue-700 dark:text-blue-300' : 'text-ink-soft'}`}>
                {mine && conversation.lastMessage && <DeliveryTicks status={conversation.lastMessage.status} className="mr-1 inline-block size-4 align-text-bottom" />}
                {preview.author && <span className="font-medium">{preview.author}: </span>}
                {preview.media && preview.media !== 'text' && preview.media !== 'system' && <span className="mr-1 inline-block align-text-bottom">{MEDIA_ICON[preview.media]}</span>}
                {preview.text}
              </span>
            )}
            {conversation.mentionCount > 0 && (
              <span
                className="flex size-5 shrink-0 animate-pop items-center justify-center rounded-full bg-cyan-600 text-white"
                aria-label="Te mencionaron"
                title="Te mencionaron"
              >
                <AtSign className="size-3.5" strokeWidth={2.5} />
              </span>
            )}
            {unread && (
              <span
                className="flex h-5 min-w-5 shrink-0 animate-pop items-center justify-center rounded-full bg-blue-600 px-1.5 text-[11px] font-bold text-white"
                aria-label={`${conversation.unreadCount} sin leer`}
              >
                {conversation.unreadCount}
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}
