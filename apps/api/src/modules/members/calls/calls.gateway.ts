import { Logger } from '@nestjs/common';
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import type { CallAck, CallInfo, CallStartRequest, SignalData } from '@parla/types';
import type { Socket } from 'socket.io';
import { DomainError } from '../../../kernel/domain-error';
import { CallCoordinator } from '../../platform/messaging/calls/use-cases/call-coordinator';

type CallSocket = Socket<Record<string, never>, Record<string, never>, Record<string, never>, { userId?: string }>;

/** Puerta en tiempo real de cada miembro a las llamadas. La sesión del socket la valida LiveGateway. */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class CallsGateway {
  private readonly logger = new Logger('CallsGateway');

  constructor(private readonly calls: CallCoordinator) {}

  private async ack(action: () => Promise<CallInfo>): Promise<CallAck> {
    try {
      return { ok: true, call: await action() };
    } catch (error) {
      if (error instanceof DomainError) return { ok: false, error: error.message };
      this.logger.error(error);
      return { ok: false, error: 'No se pudo conectar la llamada. Inténtalo de nuevo.' };
    }
  }

  @SubscribeMessage('call:start')
  start(@ConnectedSocket() socket: CallSocket, @MessageBody() body: CallStartRequest): Promise<CallAck> {
    const userId = socket.data.userId;
    if (!userId) return Promise.resolve({ ok: false, error: 'Inicia sesión para llamar' });
    return this.ack(() => this.calls.start(userId, socket.id, body ?? ({} as CallStartRequest)));
  }

  @SubscribeMessage('call:join')
  join(@ConnectedSocket() socket: CallSocket, @MessageBody() body: { callId?: string }): Promise<CallAck> {
    const userId = socket.data.userId;
    if (!userId || typeof body?.callId !== 'string') return Promise.resolve({ ok: false, error: 'Llamada no válida' });
    return this.ack(() => this.calls.join(userId, socket.id, body.callId!));
  }

  @SubscribeMessage('call:decline')
  decline(@ConnectedSocket() socket: CallSocket, @MessageBody() body: { callId?: string }): void {
    if (socket.data.userId && typeof body?.callId === 'string') this.calls.decline(socket.data.userId, body.callId);
  }

  @SubscribeMessage('call:leave')
  leave(@ConnectedSocket() socket: CallSocket, @MessageBody() body: { callId?: string }): void {
    if (socket.data.userId && typeof body?.callId === 'string') this.calls.leave(socket.data.userId, body.callId);
  }

  @SubscribeMessage('call:signal')
  signal(@ConnectedSocket() socket: CallSocket, @MessageBody() body: { callId?: string; to?: string; data?: SignalData }): void {
    const userId = socket.data.userId;
    if (!userId || typeof body?.callId !== 'string' || typeof body.to !== 'string' || !body.data) return;
    this.calls.relay(userId, body.callId, body.to, body.data);
  }
}
