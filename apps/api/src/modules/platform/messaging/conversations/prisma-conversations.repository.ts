import { Injectable } from '@nestjs/common';
import type { ConversationKind, MessageKind, WrappedKey } from '@parla/types';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infra/prisma/prisma.service';
import { toTaskRecord } from '../../../../infra/prisma/task-row';
import { toUserRecord } from '../../../../infra/prisma/user-row';
import type {
  ConversationRecord,
  ConversationsRepository,
  MessageRecord,
  NewConversation,
  NewMessage,
  ReceiptChange,
} from './conversations.repository';

const messageInclude = {
  receipts: true,
  mentions: { select: { userId: true } },
  task: true,
  replyTo: { select: { id: true, senderId: true, kind: true, ciphertext: true, iv: true, clientId: true } },
  _count: { select: { replies: true } },
} satisfies Prisma.MessageInclude;
type MessageRow = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

const conversationInclude = {
  participants: {
    orderBy: { joinedAt: 'asc' },
    include: { user: true, wrappedBy: { select: { publicKey: true } } },
  },
  messages: { orderBy: { createdAt: 'desc' }, take: 1, include: messageInclude },
} satisfies Prisma.ConversationInclude;

type ConversationRow = Prisma.ConversationGetPayload<{ include: typeof conversationInclude }>;

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
    replyTo: row.replyTo ? { ...row.replyTo, kind: row.replyTo.kind as MessageKind } : null,
    replyCount: row._count.replies,
    mentions: row.mentions.map((m) => m.userId),
    task: row.task ? toTaskRecord(row.task) : null,
  };
}

interface Counters {
  unread: number;
  mentions: number;
  openTasks: number;
}

function toConversationRecord(row: ConversationRow, counters: Counters): ConversationRecord {
  return {
    id: row.id,
    kind: row.kind as ConversationKind,
    title: row.title,
    description: row.description,
    avatarColor: row.avatarColor,
    createdById: row.createdById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    participants: row.participants.map((p) => ({
      user: toUserRecord(p.user),
      // Como en WhatsApp: quien crea el grupo lo administra.
      role: row.kind === 'group' && p.userId === row.createdById ? 'admin' : 'member',
      wrappedKey: p.wrappedKey,
      keyIv: p.keyIv,
      wrappedById: p.wrappedById,
      // Copia guardada al envolver; las filas antiguas (sin copia) usan la clave actual.
      wrapperPublicKey: p.wrapperPublicKey || p.wrappedBy.publicKey,
    })),
    lastMessage: row.messages[0] ? toMessageRecord(row.messages[0]) : null,
    unreadCount: counters.unread,
    mentionCount: counters.mentions,
    openTaskCount: counters.openTasks,
  };
}

const keyRows = (keys: WrappedKey[], publicKeyOf: Map<string, string>) =>
  keys.map((k) => ({
    userId: k.userId,
    wrappedKey: k.wrappedKey,
    keyIv: k.iv,
    wrappedById: k.wrappedById,
    wrapperPublicKey: publicKeyOf.get(k.wrappedById) ?? '',
  }));

@Injectable()
export class PrismaConversationsRepository implements ConversationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Claves públicas actuales de quienes envuelven: se guardan junto a cada copia de la clave del chat. */
  private async wrapperKeys(keys: WrappedKey[]): Promise<Map<string, string>> {
    const ids = [...new Set(keys.map((k) => k.wrappedById))];
    const rows = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, publicKey: true } });
    return new Map(rows.map((r) => [r.id, r.publicKey]));
  }

/** No leídos, menciones sin leer y tareas abiertas por conversación, en tres consultas agrupadas. */
  private async counters(userId: string, conversationIds: string[]): Promise<(id: string) => Counters> {
    if (conversationIds.length === 0) return () => ({ unread: 0, mentions: 0, openTasks: 0 });
    const inIds = { in: conversationIds };
    const [unread, mentions, tasks] = await Promise.all([
      this.prisma.messageReceipt.groupBy({
        by: ['conversationId'],
        where: { userId, readAt: null, conversationId: inIds },
        _count: { _all: true },
      }),
      this.prisma.messageReceipt.groupBy({
        by: ['conversationId'],
        where: { userId, readAt: null, conversationId: inIds, message: { mentions: { some: { userId } } } },
        _count: { _all: true },
      }),
      this.prisma.task.groupBy({
        by: ['conversationId'],
        where: { status: 'open', conversationId: inIds },
        _count: { _all: true },
      }),
    ]);
    const toMap = (groups: { conversationId: string; _count: { _all: number } }[]) =>
      new Map(groups.map((g) => [g.conversationId, g._count._all]));
    const [u, m, t] = [toMap(unread), toMap(mentions), toMap(tasks)];
    return (id) => ({ unread: u.get(id) ?? 0, mentions: m.get(id) ?? 0, openTasks: t.get(id) ?? 0 });
  }

  async listForUser(userId: string): Promise<ConversationRecord[]> {
    const rows = await this.prisma.conversation.findMany({
      where: { participants: { some: { userId } } },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      include: conversationInclude,
    });
    const countersOf = await this.counters(userId, rows.map((r) => r.id));
    return rows.map((row) => toConversationRecord(row, countersOf(row.id)));
  }

  async findForUser(conversationId: string, userId: string): Promise<ConversationRecord | null> {
    const row = await this.prisma.conversation.findFirst({
      where: { id: conversationId, participants: { some: { userId } } },
      include: conversationInclude,
    });
    if (!row) return null;
    const countersOf = await this.counters(userId, [conversationId]);
    return toConversationRecord(row, countersOf(conversationId));
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
      data: { ...data, participants: { create: keyRows(keys, await this.wrapperKeys(keys)) } },
      select: { id: true },
    });
    return row.id;
  }

  async addParticipants(conversationId: string, keys: WrappedKey[]): Promise<void> {
    await this.prisma.conversationParticipant.createMany({
      data: keyRows(keys, await this.wrapperKeys(keys)).map((k) => ({ ...k, conversationId })),
    });
  }

  async removeParticipant(conversationId: string, userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.conversationParticipant.deleteMany({ where: { conversationId, userId } }),
      this.prisma.messageReceipt.deleteMany({ where: { conversationId, userId } }),
    ]);
  }

  async markKeysPending(userId: string): Promise<string[]> {
    const rows = await this.prisma.conversationParticipant.findMany({ where: { userId }, select: { conversationId: true } });
    await this.prisma.conversationParticipant.updateMany({ where: { userId }, data: { wrappedKey: '', keyIv: '' } });
    return rows.map((r) => r.conversationId);
  }

  async reshareKeys(conversationId: string, keys: WrappedKey[]): Promise<void> {
    const rows = keyRows(keys, await this.wrapperKeys(keys));
    await this.prisma.$transaction(
      rows.map((k) =>
        this.prisma.conversationParticipant.updateMany({
          where: { conversationId, userId: k.userId, wrappedKey: '' },
          data: { wrappedKey: k.wrappedKey, keyIv: k.keyIv, wrappedById: k.wrappedById, wrapperPublicKey: k.wrapperPublicKey },
        }),
      ),
    );
  }

  async createMessage(input: NewMessage): Promise<MessageRecord> {
    const existing = await this.prisma.message.findUnique({
      where: { senderId_clientId: { senderId: input.senderId, clientId: input.clientId } },
      include: messageInclude,
    });
    if (existing) return toMessageRecord(existing);

    const { recipientIds, media, mentions = [], replyToId = null, taskId = null, ...data } = input;
    const now = new Date();
    const [row] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          ...data,
          replyToId,
          taskId,
          media: media ? JSON.stringify(media) : null,
          createdAt: now,
          receipts: {
            create: recipientIds.map((userId) => ({ userId, conversationId: input.conversationId })),
          },
          mentions: {
            create: [...new Set(mentions)].map((userId) => ({ userId, conversationId: input.conversationId })),
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

  async listReplies(rootId: string, take: number): Promise<MessageRecord[]> {
    const rows = await this.prisma.message.findMany({
      where: { replyToId: rootId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take,
      include: messageInclude,
    });
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
