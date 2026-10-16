import type { ConversationKind, DeliveryStatus, MessageKind, WorkspaceRole } from './enums.types';
import type { PublicUser } from './identity.types';

/** Clave de la conversación envuelta para un miembro concreto. */
export interface WrappedKey {
  userId: string;
  wrappedKey: string;
  iv: string;
  /** Quién envolvió la clave: el receptor usa su clave pública para derivar el secreto. */
  wrappedById: string;
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
}

export interface MediaAttachment {
  fileId: string;
  mimeType: string;
  size: number;
  /** IV con el que se cifró el archivo. */
  iv: string;
  durationMs?: number;
}

export interface ConversationParticipant {
  user: PublicUser;
  /** Rol del participante dentro del espacio de trabajo. */
  role: WorkspaceRole;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  kind: MessageKind;
  /** Texto (o pie de foto) cifrado; null en mensajes de sistema. */
  body: EncryptedPayload | null;
  media: MediaAttachment | null;
  /** Texto en claro solo para mensajes de sistema ("Ana creó el grupo"). */
  systemText: string | null;
  clientId: string;
  status: DeliveryStatus;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  workspaceId: string;
  kind: ConversationKind;
  /** Título del grupo; en chats individuales se usa el nombre del otro participante. */
  title: string;
  description: string;
  avatarColor: string;
  participants: ConversationParticipant[];
  /** La clave de la conversación envuelta para quien consulta, con la clave pública de quien la envolvió. */
  myKey: (WrappedKey & { wrapperPublicKey: string }) | null;
  lastMessage: Message | null;
  unreadCount: number;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessagePage {
  messages: Message[];
  nextCursor: string | null;
}

export interface CreateDirectConversationRequest {
  workspaceId: string;
  userId: string;
  keys: WrappedKey[];
}

export interface CreateGroupConversationRequest {
  workspaceId: string;
  title: string;
  description?: string;
  memberIds: string[];
  keys: WrappedKey[];
}

export interface AddParticipantsRequest {
  userIds: string[];
  keys: WrappedKey[];
}

export interface SendMessageRequest {
  clientId: string;
  kind: Exclude<MessageKind, 'system'>;
  body: EncryptedPayload | null;
  media: MediaAttachment | null;
}

export interface UploadedFile {
  fileId: string;
  size: number;
}
