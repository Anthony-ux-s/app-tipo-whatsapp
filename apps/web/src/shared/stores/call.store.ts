import type { CallAck, CallEndReason, CallIceConfig, CallInfo, CallKind, ConversationSummary, SignalData } from '@parla/types';
import { create } from 'zustand';
import { errorMessage, http } from '../utils/http';
import { getSocket } from '../utils/socket';

export type CallPhase = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active' | 'ended';

export interface CallPeer {
  userId: string;
  name: string;
  color: string;
}

export interface CallView {
  callId: string | null;
  conversationId: string;
  kind: CallKind;
  title: string;
  avatarColor: string;
  isGroup: boolean;
  startedBy: string;
}

interface CallState {
  phase: CallPhase;
  call: CallView | null;
  /** Personas de la conversación (para nombres y avatares en la llamada). */
  people: Record<string, CallPeer>;
  local: MediaStream | null;
  remotes: Record<string, MediaStream>;
  muted: boolean;
  cameraOff: boolean;
  startedAt: number | null;
  endReason: CallEndReason | null;
  error: string | null;

  startCall: (conversation: ConversationSummary, kind: CallKind, myId: string) => Promise<void>;
  accept: () => Promise<void>;
  decline: () => void;
  hangUp: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  dismissError: () => void;

  onIncoming: (call: CallInfo, myId: string) => Promise<void>;
  onParticipantJoined: (callId: string) => void;
  onParticipantLeft: (callId: string, userId: string) => void;
  onSignal: (callId: string, from: string, data: SignalData) => Promise<void>;
  onEnded: (callId: string, reason: CallEndReason) => void;
  onAnsweredElsewhere: (callId: string) => void;
}

/** Conexiones WebRTC por persona (fuera del estado reactivo: no se pintan). */
const peers = new Map<string, RTCPeerConnection>();
const pendingCandidates = new Map<string, RTCIceCandidateInit[]>();
let iceConfig: CallIceConfig | null = null;
let endTimer: number | null = null;

async function loadIce(): Promise<RTCConfiguration> {
  if (!iceConfig) iceConfig = await http.get<CallIceConfig>('/calls/config').catch(() => ({ iceServers: [] }));
  return { iceServers: iceConfig.iceServers };
}

async function getMedia(kind: CallKind): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador no permite llamadas');
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: kind === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
    });
  } catch {
    throw new Error(kind === 'video' ? 'Permite el uso de la cámara y el micrófono para la videollamada' : 'Permite el uso del micrófono para llamar');
  }
}

function peopleOf(conversation: ConversationSummary): Record<string, CallPeer> {
  return Object.fromEntries(
    conversation.participants.map((p) => [p.user.id, { userId: p.user.id, name: p.user.displayName, color: p.user.avatarColor }]),
  );
}

function viewOf(conversation: ConversationSummary, kind: CallKind, callId: string | null, startedBy: string): CallView {
  return {
    callId,
    conversationId: conversation.id,
    kind,
    title: conversation.title,
    avatarColor: conversation.avatarColor,
    isGroup: conversation.kind === 'group',
    startedBy,
  };
}

function signal(callId: string, to: string, data: SignalData): void {
  getSocket()?.emit('call:signal', { callId, to, data });
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}

const idle = {
  phase: 'idle' as CallPhase,
  call: null,
  people: {},
  local: null,
  remotes: {},
  muted: false,
  cameraOff: false,
  startedAt: null,
  endReason: null,
};

export const useCallStore = create<CallState>((set, get) => {
  const closePeer = (userId: string) => {
    peers.get(userId)?.close();
    peers.delete(userId);
    pendingCandidates.delete(userId);
    const { [userId]: _gone, ...remotes } = get().remotes;
    set({ remotes });
  };

  const cleanup = () => {
    for (const userId of [...peers.keys()]) closePeer(userId);
    stopStream(get().local);
  };

  const finish = (reason: CallEndReason | null) => {
    cleanup();
    if (endTimer) window.clearTimeout(endTimer);
    if (!reason) {
      set({ ...idle });
      return;
    }
    set({ phase: 'ended', endReason: reason, local: null, remotes: {} });
    endTimer = window.setTimeout(() => set({ ...idle }), 1800);
  };

  /** Una conexión por persona. Quien entra a la llamada envía la oferta; los demás responden. */
  const ensurePeer = async (userId: string, initiator: boolean): Promise<RTCPeerConnection> => {
    const existing = peers.get(userId);
    if (existing) return existing;
    const pc = new RTCPeerConnection(await loadIce());
    peers.set(userId, pc);
    const local = get().local;
    local?.getTracks().forEach((track) => pc.addTrack(track, local));
    pc.onicecandidate = (event) => {
      const callId = get().call?.callId;
      if (event.candidate && callId) {
        const c = event.candidate.toJSON();
        signal(callId, userId, {
          type: 'candidate',
          candidate: { candidate: c.candidate ?? '', sdpMid: c.sdpMid ?? null, sdpMLineIndex: c.sdpMLineIndex ?? null },
        });
      }
    };
    pc.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      set({
        remotes: { ...get().remotes, [userId]: stream },
        phase: 'active',
        startedAt: get().startedAt ?? Date.now(),
      });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') closePeer(userId);
    };
    if (initiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      signal(get().call!.callId!, userId, { type: 'offer', sdp: offer.sdp ?? '' });
    }
    return pc;
  };

  const flushCandidates = async (userId: string, pc: RTCPeerConnection) => {
    for (const candidate of pendingCandidates.get(userId) ?? []) await pc.addIceCandidate(candidate).catch(() => undefined);
    pendingCandidates.delete(userId);
  };

  const fail = (error: unknown) => {
    finish(null);
    set({ error: errorMessage(error) });
  };

  const joinWith = async (ack: CallAck) => {
    if (!ack.ok) throw new Error(ack.error);
    set({ call: { ...get().call!, callId: ack.call.callId, kind: ack.call.kind }, phase: ack.call.participants.length ? 'connecting' : 'outgoing' });
    for (const userId of ack.call.participants) await ensurePeer(userId, true);
  };

  return {
    ...idle,
    error: null,

    startCall: async (conversation, kind, myId) => {
      if (get().phase !== 'idle') return;
      set({ ...idle, phase: 'outgoing', call: viewOf(conversation, kind, null, myId), people: peopleOf(conversation), error: null });
      try {
        const local = await getMedia(kind);
        if (get().phase !== 'outgoing') return stopStream(local);
        set({ local, cameraOff: false, muted: false });
        const socket = getSocket();
        if (!socket) throw new Error('Sin conexión. Inténtalo de nuevo en un momento.');
        await joinWith(await socket.request('call:start', { conversationId: conversation.id, kind }));
      } catch (error) {
        fail(error);
      }
    },

    accept: async () => {
      const call = get().call;
      if (get().phase !== 'incoming' || !call?.callId) return;
      set({ phase: 'connecting' });
      try {
        const local = await getMedia(call.kind);
        set({ local });
        const socket = getSocket();
        if (!socket) throw new Error('Sin conexión');
        await joinWith(await socket.request('call:join', { callId: call.callId }));
        set({ phase: 'connecting' });
      } catch (error) {
        getSocket()?.emit('call:decline', { callId: call.callId });
        fail(error);
      }
    },

    decline: () => {
      const callId = get().call?.callId;
      if (callId) getSocket()?.emit('call:decline', { callId });
      finish(null);
    },

    hangUp: () => {
      const callId = get().call?.callId;
      if (callId) getSocket()?.emit('call:leave', { callId });
      finish(get().phase === 'outgoing' ? null : 'completed');
    },

    toggleMute: () => {
      const muted = !get().muted;
      get().local?.getAudioTracks().forEach((t) => (t.enabled = !muted));
      set({ muted });
    },

    toggleCamera: () => {
      const cameraOff = !get().cameraOff;
      get().local?.getVideoTracks().forEach((t) => (t.enabled = !cameraOff));
      set({ cameraOff });
    },

    dismissError: () => set({ error: null }),

    onIncoming: async (call, myId) => {
      if (get().phase !== 'idle' || call.startedBy === myId) return;
      // La conversación puede no estar cargada aún: se pide al servidor para mostrar nombre y avatar.
      const conversation = await http.get<ConversationSummary>(`/chats/${call.conversationId}`).catch(() => null);
      if (!conversation || get().phase !== 'idle') return;
      set({ ...idle, phase: 'incoming', call: viewOf(conversation, call.kind, call.callId, call.startedBy), people: peopleOf(conversation) });
    },

    onParticipantJoined: (callId) => {
      if (get().call?.callId === callId && get().phase === 'outgoing') set({ phase: 'connecting' });
    },

    onParticipantLeft: (callId, userId) => {
      if (get().call?.callId === callId) closePeer(userId);
    },

    onSignal: async (callId, from, data) => {
      if (get().call?.callId !== callId || !get().local) return;
      try {
        if (data.type === 'offer') {
          const pc = await ensurePeer(from, false);
          await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
          await flushCandidates(from, pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          signal(callId, from, { type: 'answer', sdp: answer.sdp ?? '' });
        } else if (data.type === 'answer') {
          const pc = peers.get(from);
          if (!pc) return;
          await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
          await flushCandidates(from, pc);
        } else if (data.type === 'candidate') {
          const pc = peers.get(from);
          if (pc?.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => undefined);
          else pendingCandidates.set(from, [...(pendingCandidates.get(from) ?? []), data.candidate]);
        }
      } catch (error) {
        console.warn('No se pudo negociar la llamada', error);
      }
    },

    onEnded: (callId, reason) => {
      if (get().call?.callId !== callId) return;
      finish(get().phase === 'incoming' ? null : reason);
    },

    onAnsweredElsewhere: (callId) => {
      if (get().phase === 'incoming' && get().call?.callId === callId) finish(null);
    },
  };
});
