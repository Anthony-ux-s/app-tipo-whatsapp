import type { ChatMessage } from '@shared/types/chat.types';

/** Acciones que la conversación ofrece sobre cada mensaje (las implementa el hook). */
export interface MessageActions {
  menuFor: string | null;
  toggleMenu: (clientId: string) => void;
  reply: (message: ChatMessage) => void;
  openThread: (rootId: string) => void;
  copyText: (message: ChatMessage) => void;
  openImage: (url: string, message: ChatMessage) => void;
  /** Guarda en el dispositivo la foto, el video o el audio ya descifrado. */
  download: (message: ChatMessage) => void;
  retry: (clientId: string) => void;
  /** Nombre y color de un participante (o "Ex miembro"). */
  person: (userId: string) => { name: string; color: string };
}
