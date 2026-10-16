import { Injectable } from '@nestjs/common';
import type { ConversationKind, MessageKind, WorkspaceRole, WrappedKey } from '@parla/types';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infra/prisma/prisma.service';
import { toUserRecord } from '../../../../infra/prisma/user-row';
import type {
  ConversationRecord,
  ConversationsRepository,
  MessageRecord,
  NewConversation,
  NewMessage,
  ReceiptChange,
} from './conversations.repository';

const messageInclude = { receipts: true } satisfies Prisma.MessageInclude;
type MessageRow = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

const conversationInclude = (workspaceId: string) =>
  ({
    participants: {
      orderBy: { joinedAt: 'asc' },
      include: { user: { include: { memberships: { where: { workspaceId }, select: { role: true } } } } },
    },
    messages: { orderBy: { createdAt: 'desc' }, take: 1, include: messageInclude },
  }) satisfies Prisma.ConversationInclude;

type ConversationRow = Prisma.ConversationGetPayload<{ include: ReturnType<typeof conversationInclude> }>;

function toMessageRecord(row: MessageRow): MessageRecord {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    kind: row.kind as MessageKind,
    ciphertext: row.ciphertext,
    iv: row.iv,
    media: row.media ? JSON.parse(row.media) : null,
    systemText: row.systemText,
    clientId: row.clientId,
    createdAt: row.createdAt,
    receipts: row.receipts.map((r) => ({ userId: r.userId, deliveredAt: r.deliveredAt, readAt: r.readAt })),
  };
}

function toConversationRecord(row: ConversationRow, unreadCount: number): ConversationRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    kind: row.kind as ConversationKind,
    title: row.title,
    description: row.description,
    avatarColor: row.avatarColor,
    createdById: row.createdById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    participants: row.participants.map((p) => ({
      user: toUserRecord(p.user),
      role: (p.user.memberships[0]?.role as WorkspaceRole | undefined) ?? 'member',
      wrappedKey: p.wrappedKey,
      keyIv: p.keyIv,
      wrappedById: p.wrappedById,
    })),
    lastMessage: row.messages[0] ? toMessageRecord(row.messages[0]) : null,
    unreadCount,
  };
}

const keyRows = (keys: WrappedKey[]) =>
  keys.map((k) => ({ userId: k.userId, wrappedKey: k.wrappedKey, keyIv: k.iv, wrappedById: k.wrappedById }));

@Injectable()
export class PrismaConversationsRepository implements ConversationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private async unreadCounts(userId: string, conversationIds: string[]): Promise<Map<string, number>> {
    if (conversationIds.length === 0) return new Map();
    const groups = await this.prisma.messageReceipt.groupBy({
      by: ['conversationId'],
      where: { userId, readAt: null, conversationId: { in: conversationIds } },
      _count: { _all: true },
    });
    return new Map(groups.map((g) => [g.conversationId, g._count._all]));
  }

  async listForUser(userId: string, workspaceId: string): Promise<ConversationRecord[]> {
    const rows = await this.prisma.conversation.findMany({
      where: { workspaceId, participants: { some: { userId } } },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      include: conversationInclude(workspaceId),
    });
    const unread = await this.unreadCounts(userId, rows.map((r) => r.id));
    return rows.map((row) => toConversationRecord(row, unread.get(row.id) ?? 0));
  }

  async findForUser(conversationId: string, userId: string): Promise<ConversationRecord | null> {
    const base = await this.prisma.conversation.findFirst({
      where: { id: conversationId, participants: { some: { userId } } },
      select: { workspaceId: true },
    });
    if (!base) return null;
    const row = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: conversationInclude(base.workspaceId),
    });
    const unread = await this.unreadCounts(userId, [conversationId]);
    return toConversationRecord(row, unread.get(conversationId) ?? 0);
  }

  async findIdByDirectKey(directKey: string): Promise<string | null> {
    const row = await this.prisma.conversation.findUnique({ where: { directKey }, select: { id: true } });
    return row?.id ?? null;
  }

  async participantIds(conversationId: string): Promise<string[]> {
    const rows = await this.prisma.conversationParticipant.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  async create(input: NewConversation): Promise<string> {
    const { keys, ...data } = input;
    const row = await this.prisma.conversation.create({
      data: { ...data, participants: { create: keyRows(keys) } },
      select: { id: true },
    });
    return row.id;
  }

  async addParticipants(conversationId: string, keys: WrappedKey[]): Promise<void> {
    await this.prisma.conversationParticipant.createMany({
      data: keyRows(keys).map((k) => ({ ...k, conversationId })),
    });
  }

  async removeParticipant(conversationId: string, userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.conversationParticipant.deleteMany({ where: { conversationId, userId } }),
      this.prisma.messageReceipt.deleteMany({ where: { conversationId, userId } }),
    ]);
  }

  async createMessage(input: NewMessage): Promise<MessageRecord> {
    const existing = await this.prisma.message.findUnique({
      where: { senderId_clientId: { senderId: input.senderId, clientId: input.clientId } },
      include: messageInclude,
    });
    if (existing) return toMessageRecord(existing);

    const { recipientIds, media, ...data } = input;
    const now = new Date();
    const [row] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          ...data,
          media: media ? JSON.stringify(media) : null,
          createdAt: now,
          receipts: {
            create: recipientIds.map((userId) => ({ userId, conversationId: input.conversationId })),
          },
        },
        include: messageInclude,
      }),
      this.prisma.conversation.update({ where: { id: input.conversationId }, data: { updatedAt: now } }),
    ]);
    return toMessageRecord(row);
  }

  async listMessages(conversationId: string, before: string | null, take: number): Promise<MessageRecord[]> {
    const rows = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      ...(before ? { cursor: { id: before }, skip: 1 } : {}),
      include: messageInclude,
    });
    return rows.map(toMessageRecord);
  }

  async findMessages(messageIds: string[]): Promise<MessageRecord[]> {
    const rows = await this.prisma.message.findMany({ where: { id: { in: messageIds } }, include: messageInclude });
    return rows.map(toMessageRecord);
  }

  async markDelivered(
    userId: string,
    scope: { conversationId: string; messageIds: string[] } | 'all',
  ): Promise<ReceiptChange[]> {
    const where: Prisma.MessageReceiptWhereInput = {
      userId,
      deliveredAt: null,
      ...(scope === 'all' ? {} : { conversationId: scope.conversationId, messageId: { in: scope.messageIds } }),
    };
    return this.touchReceipts(where, { deliveredAt: new Date() });
  }

  async markRead(userId: string, conversationId: string): Promise<ReceiptChange[]> {
    const now = new Date();
    const changes = await this.touchReceipts({ userId, conversationId, readAt: null }, { readAt: now });
    // Lo leído también cuenta como entregado.
    await this.prisma.messageReceipt.updateMany({
      where: { userId, conversationId, deliveredAt: null },
      data: { deliveredAt: now },
    });
    return changes;
  }

  private async touchReceipts(
    where: Prisma.MessageReceiptWhereInput,
    data: Prisma.MessageReceiptUpdateManyMutationInput,
  ): Promise<ReceiptChange[]> {
    const pending = await this.prisma.messageReceipt.findMany({
      where,
      select: { messageId: true, conversationId: true, message: { select: { senderId: true } } },
      take: 2000,
    });
    if (pending.length === 0) return [];
    await this.prisma.messageReceipt.updateMany({
      where: { ...where, messageId: { in: pending.map((p) => p.messageId) } },
      data,
    });
    return pending.map((p) => ({
      messageId: p.messageId,
      conversationId: p.conversationId,
      senderId: p.message.senderId,
    }));
  }

  async registerFile(input: { id: string; conversationId: string; uploaderId: string; size: number }): Promise<void> {
    await this.prisma.storedFile.create({ data: input });
  }

  async findFile(fileId: string): Promise<{ conversationId: string; uploaderId: string } | null> {
    return this.prisma.storedFile.findUnique({
      where: { id: fileId },
      select: { conversationId: true, uploaderId: true },
    });
  }
}
