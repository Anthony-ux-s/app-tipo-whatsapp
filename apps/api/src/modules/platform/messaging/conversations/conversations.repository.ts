import type { ConversationKind, MediaAttachment, MessageKind, WorkspaceRole, WrappedKey } from '@parla/types';
import type { ReceiptState } from '../../../../kernel/delivery-status';
import type { UserRecord } from '../../identity/user.record';

export interface ParticipantRecord {
  user: UserRecord;
  role: WorkspaceRole;
  wrappedKey: string;
  keyIv: string;
  wrappedById: string;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  senderId: string;
  kind: MessageKind;
  ciphertext: string | null;
  iv: string | null;
  media: MediaAttachment | null;
  systemText: string | null;
  clientId: string;
  createdAt: Date;
  receipts: (ReceiptState & { userId: string })[];
}

export interface ConversationRecord {
  id: string;
  workspaceId: string;
  kind: ConversationKind;
  title: string;
  description: string;
  avatarColor: string;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  participants: ParticipantRecord[];
  lastMessage: MessageRecord | null;
  unreadCount: number;
}

export interface NewConversation {
  workspaceId: string;
  kind: ConversationKind;
  title: string;
  description: string;
  avatarColor: string;
  directKey: string | null;
  createdById: string;
  keys: WrappedKey[];
}

export interface NewMessage {
  conversationId: string;
  senderId: string;
  kind: MessageKind;
  ciphertext: string | null;
  iv: string | null;
  media: MediaAttachment | null;
  systemText: string | null;
  clientId: string;
  /** Destinatarios: se crea un recibo pendiente para cada uno. */
  recipientIds: string[];
}

/** Recibo que cambió: sirve para avisar al remitente del nuevo estado. */
export interface ReceiptChange {
  messageId: string;
  conversationId: string;
  senderId: string;
}

export interface ConversationsRepository {
  listForUser(userId: string, workspaceId: string): Promise<ConversationRecord[]>;
  /** null si no existe o si el usuario no participa. */
  findForUser(conversationId: string, userId: string): Promise<ConversationRecord | null>;
  findIdByDirectKey(directKey: string): Promise<string | null>;
  participantIds(conversationId: string): Promise<string[]>;
  create(input: NewConversation): Promise<string>;
  addParticipants(conversationId: string, keys: WrappedKey[]): Promise<void>;
  removeParticipant(conversationId: string, userId: string): Promise<void>;
  /** Idempotente por (remitente, clientId): un reintento devuelve el mensaje ya guardado. */
  createMessage(input: NewMessage): Promise<MessageRecord>;
  listMessages(conversationId: string, before: string | null, take: number): Promise<MessageRecord[]>;
  findMessages(messageIds: string[]): Promise<MessageRecord[]>;
  markDelivered(userId: string, scope: { conversationId: string; messageIds: string[] } | 'all'): Promise<ReceiptChange[]>;
  markRead(userId: string, conversationId: string): Promise<ReceiptChange[]>;
  registerFile(input: { id: string; conversationId: string; uploaderId: string; size: number }): Promise<void>;
  findFile(fileId: string): Promise<{ conversationId: string; uploaderId: string } | null>;
}

export const CONVERSATIONS_REPOSITORY = Symbol('CONVERSATIONS_REPOSITORY');
