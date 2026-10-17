import type { ConversationKind, DeliveryStatus, MessageKind, TaskStatus, ParticipantRole } from './enums.types';
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
  /** admin = quien creó el grupo; en chats individuales, ambos son member. */
  role: ParticipantRole;
  /**
   * La persona restableció su cuenta (claves nuevas) y espera que alguien del chat le vuelva a
   * compartir la clave de la conversación.
   */
  keyPending: boolean;
}

/** Resumen del mensaje al que se responde (para dibujar la cita). */
export interface ReplyReference {
  id: string;
  senderId: string;
  kind: MessageKind;
  body: EncryptedPayload | null;
  clientId: string;
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
  /** Hilo: la raíz a la que responde este mensaje. */
  replyTo: ReplyReference | null;
  /** Respuestas en el hilo de este mensaje (si es raíz). */
  replyCount: number;
  /** Personas mencionadas con @ (ids). */
  mentions: string[];
  /** Tarea que presenta el mensaje (kind = task). */
  task: Task | null;
}

export interface ConversationSummary {
  id: string;
  kind: ConversationKind;
  /** Título del grupo; en chats individuales se usa el nombre del otro participante. */
  title: string;
  description: string;
  avatarColor: string;
  /** En chats individuales, la foto de la otra persona; en grupos, null. */
  avatarUrl: string | null;
  participants: ConversationParticipant[];
  /** La clave de la conversación envuelta para quien consulta, con la clave pública de quien la envolvió. */
  myKey: (WrappedKey & { wrapperPublicKey: string }) | null;
  lastMessage: Message | null;
  unreadCount: number;
  /** Mensajes sin leer que me mencionan. */
  mentionCount: number;
  /** Tareas abiertas del chat. */
  openTaskCount: number;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessagePage {
  messages: Message[];
  nextCursor: string | null;
}

export interface CreateDirectConversationRequest {
  userId: string;
  keys: WrappedKey[];
}

export interface CreateGroupConversationRequest {
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
  kind: Exclude<MessageKind, 'system' | 'task'>;
  body: EncryptedPayload | null;
  media: MediaAttachment | null;
  /** Responder en el hilo de este mensaje. */
  replyToId?: string | null;
  /** Ids de las personas mencionadas con @. */
  mentions?: string[];
}

export interface ThreadPage {
  root: Message;
  replies: Message[];
}

/** Tarea asignable dentro de un chat (el título va cifrado con la clave de la conversación). */
export interface Task {
  id: string;
  conversationId: string;
  title: EncryptedPayload;
  assigneeId: string | null;
  createdById: string;
  dueDate: string | null;
  status: TaskStatus;
  sourceMessageId: string | null;
  createdAt: string;
  completedAt: string | null;
  completedById: string | null;
}

export interface CreateTaskRequest {
  clientId: string;
  title: EncryptedPayload;
  assigneeId: string | null;
  dueDate: string | null;
  sourceMessageId: string | null;
}

export interface UpdateTaskRequest {
  status?: TaskStatus;
  assigneeId?: string | null;
  dueDate?: string | null;
}

export type TaskScope = 'assigned' | 'created' | 'done';

/** Suscripción Web Push del navegador. */
export interface PushSubscriptionRequest {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Contenido de una notificación push: sin texto de mensajes (van cifrados de extremo a extremo). */
export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface UploadedFile {
  fileId: string;
  size: number;
}

/** Volver a compartir la clave del chat con quien restableció su cuenta. */
export interface ReshareKeysRequest {
  keys: WrappedKey[];
}
