import { Body, Controller, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { AdminClaim } from '@parla/types';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { InternalTokenGuard } from '../../../http/internal-token.guard';
import { Public } from '../../../http/public.decorator';
import { ReserveClaimRefundUseCase, SettleClaimRefundUseCase } from './use-cases/claims.use-cases';

class ReserveRefundDto {
  @IsString() @MaxLength(64) adminUserId: string;
  @IsInt() @Min(1) @Max(1_000_000) amountCents: number;
}

class SettleRefundDto {
  @IsIn(['refunded', 'failed']) status: 'refunded' | 'failed';
  @IsOptional() @IsString() @MaxLength(80) providerRefundId?: string;
  @IsOptional() @IsString() @MaxLength(200) failureReason?: string;
}

/**
 * Para el gateway (devolución de un reclamo con PagaYa): reservar la devolución y cerrarla después.
 * Solo entre servicios, con el token interno.
 */
@Public()
@SkipThrottle()
@UseGuards(InternalTokenGuard)
@Controller('internal/claims')
export class InternalClaimsController {
  constructor(
    private readonly reserve: ReserveClaimRefundUseCase,
    private readonly settle: SettleClaimRefundUseCase,
  ) {}

  @HttpCode(201)
  @Post(':id/refund-reservations')
  reserveRefund(@Param('id') id: string, @Body() body: ReserveRefundDto) {
    return this.reserve.execute(body.adminUserId, id, body.amountCents);
  }

  @Patch(':id/refund')
  settleRefund(@Param('id') id: string, @Body() body: SettleRefundDto): Promise<AdminClaim> {
    return this.settle.execute(id, body.status, body.providerRefundId ?? null, body.failureReason ?? null);
  }
}
