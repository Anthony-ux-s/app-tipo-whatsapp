import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { CallEndReason, CallInfo, CallKind, CallStartRequest, SignalData } from '@parla/types';
import { randomUUID } from 'node:crypto';
import { effectivePlan, planById } from '../../../../../kernel/billing-plans';
import { assertCallKind, assertRoomForParticipant, callLabel, callLogText, RING_TIMEOUT_MS } from '../../../../../kernel/call-rules';
import { ConflictError, NotFoundError, ValidationError } from '../../../../../kernel/domain-error';
import { REALTIME_PUBLISHER, type RealtimePublisher } from '../../../../../infra/realtime/realtime-publisher.port';
import { WORKSPACES_REPOSITORY, type WorkspacesRepository } from '../../../workspaces/workspaces.repository';
import { CONVERSATIONS_REPOSITORY, type ConversationRecord, type ConversationsRepository } from '../../conversations/conversations.repository';
import { pushContextFor, SendMessageUseCase } from '../../conversations/use-cases/send-message.use-case';
import { NotificationDispatcher } from '../../push/use-cases/notification-dispatcher';

interface ActiveCall {
  id: string;
  conversationId: string;
  participants: string[];
  kind: CallKind;
  startedBy: string;
  answeredAt: number | null;
  maxParticipants: number;
  /** userId → socket con el que está en la llamada. */
  joined: Map<string, string>;
  /** Personas a las que todavía les suena. */
  ringing: Set<string>;
  ringTimer: NodeJS.Timeout | null;
}

const MAX_SDP = 100_000;

/**
 * Señalización de llamadas WebRTC (voz y video, 1:1 y grupales en malla). El servidor solo coordina
 * quién llama a quién y reenvía ofertas, respuestas y candidatos ICE: el audio y el video viajan P2P,
 * cifrados con DTLS-SRTP. Al terminar deja un aviso en el chat ("Videollamada · 3:05", "perdida").
 */
@Injectable()
export class CallCoordinator implements OnModuleDestroy {
  private readonly logger = new Logger('Calls');
  private readonly calls = new Map<string, ActiveCall>();
  private readonly userCall = new Map<string, string>();
  private readonly socketUser = new Map<string, { userId: string; callId: string }>();

  constructor(
    @Inject(CONVERSATIONS_REPOSITORY) private readonly conversations: ConversationsRepository,
    @Inject(WORKSPACES_REPOSITORY) private readonly workspaces: WorkspacesRepository,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
    private readonly messages: SendMessageUseCase,
    private readonly notifications: NotificationDispatcher,
  ) {}

  onModuleDestroy(): void {
    for (const call of this.calls.values()) if (call.ringTimer) clearTimeout(call.ringTimer);
  }

  private info(call: ActiveCall, participants = [...call.joined.keys()]): CallInfo {
    return { callId: call.id, conversationId: call.conversationId, kind: call.kind, startedBy: call.startedBy, participants };
  }

  private async requireConversation(conversationId: string, userId: string): Promise<ConversationRecord> {
    const conversation = await this.conversations.findForUser(conversationId, userId);
    if (!conversation) throw new NotFoundError('Conversación no encontrada');
    return conversation;
  }

  private assertFree(userId: string, callId?: string): void {
    const current = this.userCall.get(userId);
    if (current && current !== callId) throw new ConflictError('Ya estás en otra llamada');
  }

  /** Llamar: si en ese chat ya hay una llamada en curso, se une a ella. */
  async start(userId: string, socketId: string, input: CallStartRequest): Promise<CallInfo> {
    assertCallKind(input.kind);
    const conversation = await this.requireConversation(input.conversationId, userId);
    const ongoing = [...this.calls.values()].find((c) => c.conversationId === conversation.id);
    if (ongoing) return this.join(userId, socketId, ongoing.id);
    this.assertFree(userId);

    const ws = await this.workspaces.findById(conversation.workspaceId);
    const plan = planById(ws ? effectivePlan(ws.plan, ws.planExpiresAt) : 'free');
    const others = conversation.participants.map((p) => p.user.id).filter((id) => id !== userId);
    if (others.length === 0) throw new ValidationError('No hay nadie más en este chat para llamar');

    const call: ActiveCall = {
      id: randomUUID(),
      conversationId: conversation.id,
      participants: conversation.participants.map((p) => p.user.id),
      kind: input.kind,
      startedBy: userId,
      answeredAt: null,
      maxParticipants: plan.maxCallParticipants,
      joined: new Map([[userId, socketId]]),
      ringing: new Set(others),
      ringTimer: null,
    };
    call.ringTimer = setTimeout(() => void this.onRingTimeout(call.id), RING_TIMEOUT_MS);
    this.calls.set(call.id, call);
    this.userCall.set(userId, call.id);
    this.socketUser.set(socketId, { userId, callId: call.id });

    const info = this.info(call);
    this.realtime.toUsers(others, 'call:incoming', { call: info });
    void this.notifications.notify(others, (recipientId) => {
      const ctx = pushContextFor(conversation, userId, recipientId);
      return {
        title: ctx.conversationTitle,
        body: `${ctx.senderName} te está llamando · ${callLabel(call.kind)}`,
        url: `/app/w/${conversation.workspaceId}/c/${conversation.id}`,
        tag: `call-${call.id}`,
      };
    });
    return info;
  }

  /** Contestar o unirse. Devuelve con quién conectarse (quien entra envía las ofertas). */
  async join(userId: string, socketId: string, callId: string): Promise<CallInfo> {
    const call = this.calls.get(callId);
    if (!call) throw new NotFoundError('La llamada ya terminó');
    if (!call.participants.includes(userId)) await this.requireConversation(call.conversationId, userId);
    this.assertFree(userId, callId);
    if (call.joined.has(userId)) throw new ConflictError('Ya estás en esta llamada desde otro dispositivo');
    assertRoomForParticipant(call.joined.size, call.maxParticipants);

    const existing = [...call.joined.entries()];
    call.joined.set(userId, socketId);
    call.ringing.delete(userId);
    this.userCall.set(userId, call.id);
    this.socketUser.set(socketId, { userId, callId });
    if (call.answeredAt === null) {
      call.answeredAt = Date.now();
      if (call.ringTimer) clearTimeout(call.ringTimer);
      call.ringTimer = null;
    }

    this.realtime.toSockets(existing.map(([, s]) => s), 'call:participant-joined', { callId, userId });
    this.realtime.toUsers([userId], 'call:answered-elsewhere', { callId });
    return this.info(call, existing.map(([id]) => id));
  }

  decline(userId: string, callId: string): void {
    const call = this.calls.get(callId);
    if (!call || !call.ringing.delete(userId)) return;
    this.realtime.toSockets([...call.joined.values()], 'call:declined', { callId, userId });
    this.realtime.toUsers([userId], 'call:answered-elsewhere', { callId });
    if (call.answeredAt === null && call.ringing.size === 0) void this.end(call, 'declined');
  }

  leave(userId: string, callId: string): void {
    const call = this.calls.get(callId);
    if (!call || !call.joined.has(userId)) return;
    const socketId = call.joined.get(userId)!;
    call.joined.delete(userId);
    this.userCall.delete(userId);
    this.socketUser.delete(socketId);
    this.realtime.toSockets([...call.joined.values()], 'call:participant-left', { callId, userId });

    if (call.answeredAt === null && call.joined.size === 0) void this.end(call, 'cancelled');
    else if (call.answeredAt !== null && call.joined.size <= 1) void this.end(call, 'completed');
  }

  /** Se cerró la pestaña o se cayó la conexión: sale de la llamada. */
  socketClosed(socketId: string): void {
    const entry = this.socketUser.get(socketId);
    if (entry) this.leave(entry.userId, entry.callId);
  }

  /** Reenvía oferta, respuesta o candidato ICE entre dos personas de la misma llamada. */
  relay(userId: string, callId: string, to: string, data: SignalData): void {
    const call = this.calls.get(callId);
    const target = call?.joined.get(to);
    if (!call || !target || !call.joined.has(userId) || to === userId) return;
    if (!this.validSignal(data)) return;
    this.realtime.toSockets([target], 'call:signal', { callId, from: userId, data });
  }

  /** Para pruebas y diagnóstico. */
  activeCallOf(userId: string): string | null {
    return this.userCall.get(userId) ?? null;
  }

  private validSignal(data: SignalData): boolean {
    if (!data || typeof data !== 'object') return false;
    if (data.type === 'offer' || data.type === 'answer') return typeof data.sdp === 'string' && data.sdp.length < MAX_SDP;
    return data.type === 'candidate' && typeof data.candidate?.candidate === 'string';
  }

  private async onRingTimeout(callId: string): Promise<void> {
    const call = this.calls.get(callId);
    if (!call || call.answeredAt !== null) return;
    await this.end(call, 'missed');
  }

  private async end(call: ActiveCall, reason: CallEndReason): Promise<void> {
    if (!this.calls.delete(call.id)) return;
    if (call.ringTimer) clearTimeout(call.ringTimer);
    for (const [userId, socketId] of call.joined) {
      this.userCall.delete(userId);
      this.socketUser.delete(socketId);
    }
    this.realtime.toUsers(call.participants, 'call:ended', { callId: call.id, reason });
    const answered = call.answeredAt !== null;
    const text = callLogText(call.kind, answered, answered ? Date.now() - call.answeredAt! : 0);
    await this.messages.postSystem(call.conversationId, call.startedBy, text, call.participants).catch((error) =>
      this.logger.error(error),
    );
  }
}
