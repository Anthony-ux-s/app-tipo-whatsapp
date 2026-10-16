export type CallKind = 'audio' | 'video';
export type CallEndReason = 'completed' | 'missed' | 'declined' | 'cancelled' | 'failed';

/** Datos de señalización WebRTC: viajan por el servidor, el audio y el video no (van P2P y cifrados). */
export type SignalData =
  | { type: 'offer' | 'answer'; sdp: string }
  | { type: 'candidate'; candidate: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null } };

export interface CallInfo {
  callId: string;
  conversationId: string;
  kind: CallKind;
  startedBy: string;
  /** Personas ya conectadas a la llamada. */
  participants: string[];
}

export interface CallIceConfig {
  iceServers: { urls: string | string[]; username?: string; credential?: string }[];
}

/** Respuesta (ack) del servidor a las acciones de llamada. */
export type CallAck<T = CallInfo> = { ok: true; call: T } | { ok: false; error: string };

export interface CallStartRequest {
  conversationId: string;
  kind: CallKind;
}
