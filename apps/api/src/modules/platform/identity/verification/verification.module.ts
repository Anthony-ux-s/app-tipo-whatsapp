import { Module } from '@nestjs/common';
import { CodeVerifier } from './code-verifier';
import { PrismaVerificationCodesRepository } from './prisma-verification-codes.repository';
import { VERIFICATION_CODES_REPOSITORY } from './verification-codes.repository';

/** Códigos de verificación por SMS y correo (los usan el registro, el perfil y la recuperación). */
@Module({
  providers: [{ provide: VERIFICATION_CODES_REPOSITORY, useClass: PrismaVerificationCodesRepository }, CodeVerifier],
  exports: [CodeVerifier],
})
export class VerificationModule {}
