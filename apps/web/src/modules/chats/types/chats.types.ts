import type { ConversationSummary } from '@parla/types';
import type { Preview } from '../utils/conversation-preview.utils';

export type ChatFilter = 'all' | 'unread' | 'groups' | 'direct';

export interface ChatListEntry {
  conversation: ConversationSummary;
  preview: Preview;
  time: string;
  typing: string | null;
  online: boolean;
  mine: boolean;
}

export type NewChatMode = 'direct' | 'group';

export interface PendingAttachment {
  file: File;
  kind: 'image' | 'video';
  previewUrl: string;
}

export type RecorderState = 'idle' | 'recording' | 'sending';
