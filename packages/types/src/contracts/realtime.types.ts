import type { DeliveryStatus, PresenceStatus } from './enums.types';
import type { CallAck, CallEndReason, CallInfo, CallStartRequest, SignalData } from './calls.types';
import type { ConversationSummary, Message } from './messaging.types';
import type { PublicUser } from './identity.types';
import type { BusinessOrder, Order } from './services.types';

/** Eventos que el servidor emite por el socket. */
export interface ServerToClientEvents {
  'message:new': (message: Message) => void;
  'message:replies': (payload: { conversationId: string; messageId: string; replyCount: number }) => void;
  'message:status': (update: MessageStatusUpdate) => void;
  'conversation:upsert': (conversation: ConversationSummary) => void;
  /** Un pedido de Servicios cambió de estado (pagado, en camino, entregado…). */
  'order:updated': (order: Order) => void;
  /** Al dueño del negocio: llegó un pedido pagado o cambió uno de los suyos. */
  'business-order:updated': (order: BusinessOrder) => void;
  /** Alguien cambió su foto, nombre o usuario: los demás actualizan su vista. */
  'profile:updated': (user: PublicUser) => void;
  typing: (payload: TypingPayload) => void;
  presence: (payload: PresencePayload) => void;
  'call:incoming': (payload: { call: CallInfo }) => void;
  'call:participant-joined': (payload: { callId: string; userId: string }) => void;
  'call:participant-left': (payload: { callId: string; userId: string }) => void;
  'call:declined': (payload: { callId: string; userId: string }) => void;
  'call:answered-elsewhere': (payload: { callId: string }) => void;
  'call:ended': (payload: { callId: string; reason: CallEndReason }) => void;
  'call:signal': (payload: { callId: string; from: string; data: SignalData }) => void;
}

/** Eventos que el cliente emite por el socket. */
export interface ClientToServerEvents {
  typing: (payload: { conversationId: string; isTyping: boolean }) => void;
  'call:start': (payload: CallStartRequest, ack: (result: CallAck) => void) => void;
  'call:join': (payload: { callId: string }, ack: (result: CallAck) => void) => void;
  'call:decline': (payload: { callId: string }) => void;
  'call:leave': (payload: { callId: string }) => void;
  'call:signal': (payload: { callId: string; to: string; data: SignalData }) => void;
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
