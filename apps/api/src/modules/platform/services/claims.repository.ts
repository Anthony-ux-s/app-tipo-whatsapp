import type { ClaimItem, ClaimReason, ClaimStatus } from '@parla/types';

export interface ClaimRecord {
  id: string;
  orderId: string;
  userId: string;
  reason: ClaimReason;
  comment: string;
  items: ClaimItem[];
  photoId: string | null;
  suggestedCents: number;
  status: ClaimStatus;
  refundCents: number | null;
  refundRef: string | null;
  providerRefundId: string | null;
  resolutionNote: string;
  resolvedById: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

export type NewClaim = Pick<ClaimRecord, 'orderId' | 'userId' | 'reason' | 'comment' | 'items' | 'photoId' | 'suggestedCents'>;

export type ClaimChanges = Partial<Pick<ClaimRecord, 'status' | 'refundCents' | 'refundRef' | 'providerRefundId' | 'resolutionNote' | 'resolvedById' | 'resolvedAt'>>;

export interface ClaimsRepository {
  create(claim: NewClaim): Promise<ClaimRecord>;
  findById(id: string): Promise<ClaimRecord | null>;
  /** Para soporte: reclamos en estos estados, los más antiguos primero. */
  listByStatus(statuses: ClaimStatus[], limit: number): Promise<ClaimRecord[]>;
  /** Cambia el reclamo solo si sigue en `expected` (comparar y cambiar atómico). */
  updateIfStatus(id: string, expected: ClaimStatus, changes: ClaimChanges): Promise<ClaimRecord | null>;
}

export const CLAIMS_REPOSITORY = Symbol('CLAIMS_REPOSITORY');
