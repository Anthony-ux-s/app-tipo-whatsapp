import { Module } from '@nestjs/common';
import { MessagingEngineModule } from '../../messaging/conversations/messaging-engine.module';
import { AuthModule } from '../auth/auth.module';
import { VerificationModule } from '../verification/verification.module';
import { RecoveryController } from './recovery.controller';
import { ForgotPasswordUseCase, ResetPasswordUseCase, VerifyResetCodeUseCase } from './recovery.use-cases';

/**
 * Recuperación de la cuenta. Vive aparte de AuthModule porque toca los chats (avisa el cambio de
 * clave) y la mensajería ya depende de AuthModule.
 */
@Module({
  imports: [AuthModule, VerificationModule, MessagingEngineModule],
  controllers: [RecoveryController],
  providers: [ForgotPasswordUseCase, VerifyResetCodeUseCase, ResetPasswordUseCase],
})
export class RecoveryModule {}
