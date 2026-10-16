import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infra/prisma/prisma.service';
import type { PushSubscriptionsRepository, StoredSubscription } from './push-subscriptions.repository';

@Injectable()
export class PrismaPushSubscriptionsRepository implements PushSubscriptionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(subscription: StoredSubscription): Promise<void> {
    const { endpoint, ...data } = subscription;
    await this.prisma.pushSubscription.upsert({ where: { endpoint }, create: subscription, update: data });
  }

  async remove(userId: string, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  async removeByEndpoint(endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint } });
  }

  listForUsers(userIds: string[]): Promise<StoredSubscription[]> {
    if (userIds.length === 0) return Promise.resolve([]);
    return this.prisma.pushSubscription.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, endpoint: true, p256dh: true, auth: true },
    });
  }

  countForUser(userId: string): Promise<number> {
    return this.prisma.pushSubscription.count({ where: { userId } });
  }
}
