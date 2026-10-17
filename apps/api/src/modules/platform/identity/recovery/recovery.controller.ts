import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthResponse, VerificationProof, VerificationStarted } from '@parla/types';
import { Public } from '../../../../http/public.decorator';
import { ForgotPasswordDto, ResetPasswordDto, VerifyResetCodeDto } from '../auth/dto/auth.dto';
import { ForgotPasswordUseCase, ResetPasswordUseCase, VerifyResetCodeUseCase } from './recovery.use-cases';

/** Restablecer la contraseña con un código al correo verificado. */
@Public()
@Controller('auth/password')
export class RecoveryController {
  constructor(
    private readonly forgot: ForgotPasswordUseCase,
    private readonly verifyCode: VerifyResetCodeUseCase,
    private readonly reset: ResetPasswordUseCase,
  ) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('forgot')
  start(@Body() body: ForgotPasswordDto): Promise<VerificationStarted> {
    return this.forgot.execute(body.email);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('verify')
  verify(@Body() body: VerifyResetCodeDto): Promise<VerificationProof> {
    return this.verifyCode.execute(body.email, body.code);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('reset')
  finish(@Body() body: ResetPasswordDto): Promise<AuthResponse> {
    return this.reset.execute(body);
  }
}
