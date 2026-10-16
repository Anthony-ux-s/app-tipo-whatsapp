import type { PushTarget } from '../../../../infra/push/push-sender.port';

export interface StoredSubscription extends PushTarget {
  userId: string;
}

export interface PushSubscriptionsRepository {
  /** Guarda o reasigna (un navegador = un endpoint = un usuario). */
  save(subscription: StoredSubscription): Promise<void>;
  remove(userId: string, endpoint: string): Promise<void>;
  removeByEndpoint(endpoint: string): Promise<void>;
  listForUsers(userIds: string[]): Promise<StoredSubscription[]>;
  countForUser(userId: string): Promise<number>;
}

export const PUSH_SUBSCRIPTIONS_REPOSITORY = Symbol('PUSH_SUBSCRIPTIONS_REPOSITORY');
