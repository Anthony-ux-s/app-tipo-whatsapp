import type { VerificationChannel, VerificationPurpose } from '../../../../kernel/verification-rules';

export interface VerificationRecord {
  id: string;
  channel: VerificationChannel;
  purpose: VerificationPurpose;
  target: string;
  userId: string | null;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  verifiedAt: Date | null;
  proofHash: string | null;
  consumedAt: Date | null;
  createdAt: Date;
}

export type NewVerification = Pick<VerificationRecord, 'channel' | 'purpose' | 'target' | 'userId' | 'codeHash' | 'expiresAt'>;

export interface VerificationCodesRepository {
  create(input: NewVerification): Promise<VerificationRecord>;
  /** Envíos recientes al mismo destino y para lo mismo (límite de reenvíos). */
  listRecent(target: string, purpose: VerificationPurpose, since: Date): Promise<VerificationRecord[]>;
  /** El último código sin verificar para ese destino o esa cuenta. */
  findLatestPending(query: { purpose: VerificationPurpose; target?: string; userId?: string }): Promise<VerificationRecord | null>;
  countAttempt(id: string): Promise<void>;
  markVerified(id: string, proofHash: string, at: Date): Promise<void>;
  findByProof(proofHash: string): Promise<VerificationRecord | null>;
  /** Marca el comprobante como usado; false si ya lo estaba (dos registros con el mismo comprobante). */
  consume(id: string, at: Date): Promise<boolean>;
}

export const VERIFICATION_CODES_REPOSITORY = Symbol('VERIFICATION_CODES_REPOSITORY');
