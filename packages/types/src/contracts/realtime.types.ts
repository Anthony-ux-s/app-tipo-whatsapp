import type { DeliveryStatus, PresenceStatus } from './enums.types';
import type { ConversationSummary, Message, Task } from './messaging.types';

/** Eventos que el servidor emite por el socket. */
export interface ServerToClientEvents {
  'message:new': (message: Message) => void;
  'message:replies': (payload: { conversationId: string; messageId: string; replyCount: number }) => void;
  'task:upsert': (task: Task) => void;
  'message:status': (update: MessageStatusUpdate) => void;
  'conversation:upsert': (conversation: ConversationSummary) => void;
  'workspace:changed': (payload: { workspaceId: string }) => void;
  typing: (payload: TypingPayload) => void;
  presence: (payload: PresencePayload) => void;
}

/** Eventos que el cliente emite por el socket. */
export interface ClientToServerEvents {
  typing: (payload: { conversationId: string; isTyping: boolean }) => void;
}

export interface MessageStatusUpdate {
  conversationId: string;
  messageIds: string[];
  status: DeliveryStatus;
}

export interface TypingPayload {
  conversationId: string;
  userId: string;
  isTyping: boolean;
}

export interface PresencePayload {
  userId: string;
  presence: PresenceStatus;
  lastSeenAt: string | null;
}
