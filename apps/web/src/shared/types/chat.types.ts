import type { Message } from '@parla/types';

/** Mensaje tal como lo pinta la interfaz: puede estar aún enviándose o haber fallado. */
export interface ChatMessage extends Message {
  local?: 'pending' | 'failed';
  /** Vista previa local (blob:) mientras el archivo se cifra y se sube. */
  localPreviewUrl?: string;
}

/** Texto descifrado de un mensaje, indexado por su clientId. */
export type DecryptedText = { ok: true; text: string } | { ok: false };

export interface MessageThread {
  items: ChatMessage[];
  nextCursor: string | null;
  status: 'loading' | 'ready' | 'error';
  loadingOlder: boolean;
}

export type ConnectionState = 'connecting' | 'online' | 'offline';
