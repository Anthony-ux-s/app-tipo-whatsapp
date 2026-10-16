import { Inject, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
} from '@nestjs/websockets';
import type { ClientToServerEvents, ServerToClientEvents } from '@parla/types';
import type { Socket } from 'socket.io';
import { TOKEN_SERVICE, type TokenService } from '../../../../infra/identity/token-service.port';
import { PresenceRegistry } from '../../../../infra/realtime/presence.registry';
import { REALTIME_PUBLISHER, type RealtimePublisher } from '../../../../infra/realtime/realtime-publisher.port';
import { SocketServerHolder, userRoom, type ParlaServer } from '../../../../infra/realtime/socket-server.holder';
import { AUTH_REPOSITORY, type AuthRepository } from '../../identity/auth/auth.repository';
import { WORKSPACES_REPOSITORY, type WorkspacesRepository } from '../../workspaces/workspaces.repository';
import { CONVERSATIONS_REPOSITORY, type ConversationsRepository } from '../conversations/conversations.repository';
import { CallCoordinator } from '../calls/use-cases/call-coordinator';
import { MarkDeliveredUseCase } from '../conversations/use-cases/receipts.use-case';

type ParlaSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, { userId: string }>;

/** Puerta en tiempo real: autentica el socket, gestiona presencia y reenvía "escribiendo…". */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class LiveGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger('LiveGateway');

  constructor(
    private readonly holder: SocketServerHolder,
    private readonly presence: PresenceRegistry,
    private readonly markDelivered: MarkDeliveredUseCase,
    private readonly calls: CallCoordinator,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(WORKSPACES_REPOSITORY) private readonly workspaces: WorkspacesRepository,
    @Inject(CONVERSATIONS_REPOSITORY) private readonly conversations: ConversationsRepository,
  ) {}

  afterInit(server: ParlaServer): void {
    this.holder.server = server;
  }

  async handleConnection(socket: ParlaSocket): Promise<void> {
    const token = typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : '';
    const userId = token ? await this.tokens.verify(token) : null;
    const account = userId ? await this.users.findById(userId) : null;
    if (!userId || !account || account.deletedAt) {
      socket.disconnect(true);
      return;
    }
    socket.data.userId = userId;
    await socket.join(userRoom(userId));

    if (this.presence.connect(userId)) await this.broadcastPresence(userId, 'online', null);
    await this.markDelivered.everythingPending(userId).catch((error) => this.logger.error(error));
  }

  async handleDisconnect(socket: ParlaSocket): Promise<void> {
    // Si estaba en una llamada con esta conexión, sale de ella.
    this.calls.socketClosed(socket.id);
    const userId = socket.data.userId;
    if (!userId || !this.presence.disconnect(userId)) return;
    const now = new Date();
    await this.users.touchLastSeen(userId, now);
    await this.broadcastPresence(userId, 'offline', now.toISOString());
  }

  @SubscribeMessage('typing')
  async onTyping(
    @ConnectedSocket() socket: ParlaSocket,
    @MessageBody() payload: { conversationId?: unknown; isTyping?: unknown },
  ): Promise<void> {
    const userId = socket.data.userId;
    if (!userId || typeof payload?.conversationId !== 'string') return;
    const participants = await this.conversations.participantIds(payload.conversationId);
    if (!participants.includes(userId)) return;
    this.realtime.toUsers(
      participants.filter((id) => id !== userId),
      'typing',
      { conversationId: payload.conversationId, userId, isTyping: payload.isTyping === true },
    );
  }

  private async broadcastPresence(userId: string, presence: 'online' | 'offline', lastSeenAt: string | null) {
    const contacts = await this.workspaces.listContactIds(userId);
    this.realtime.toUsers(contacts, 'presence', { userId, presence, lastSeenAt });
  }
}
