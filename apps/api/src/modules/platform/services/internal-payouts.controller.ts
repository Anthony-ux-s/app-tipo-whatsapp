import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { PayoutResult } from '@parla/types';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { InternalTokenGuard } from '../../../http/internal-token.guard';
import { Public } from '../../../http/public.decorator';
import { DuePayoutsUseCase, ReservePayoutUseCase, SettlePayoutUseCase, StuckPayoutsUseCase } from './use-cases/driver-wallet.use-cases';

class ReservePayoutDto {
  @IsIn(['manual', 'auto']) reason: 'manual' | 'auto';
}

class SettlePayoutDto {
  @IsIn(['paid', 'failed']) status: 'paid' | 'failed';
  @IsOptional() @IsString() @MaxLength(80) transferId?: string;
  @IsOptional() @IsString() @MaxLength(200) failureReason?: string;
}

/**
 * Para el gateway (depósitos de las ganancias a PagaYa): reservar el saldo, cerrar el depósito tras la
 * transferencia y la lista para el depósito automático diario. Solo entre servicios, token interno.
 */
@Public()
@SkipThrottle()
@UseGuards(InternalTokenGuard)
@Controller('internal')
export class InternalPayoutsController {
  constructor(
    private readonly reserve: ReservePayoutUseCase,
    private readonly settle: SettlePayoutUseCase,
    private readonly due: DuePayoutsUseCase,
    private readonly stuck: StuckPayoutsUseCase,
  ) {}

  @HttpCode(201)
  @Post('drivers/:userId/payouts')
  reservePayout(@Param('userId') userId: string, @Body() body: ReservePayoutDto) {
    return this.reserve.execute(userId, body.reason);
  }

  @Patch('payouts/:payoutId')
  settlePayout(@Param('payoutId') payoutId: string, @Body() body: SettlePayoutDto): Promise<PayoutResult> {
    return this.settle.execute(payoutId, body.status, body.transferId ?? null, body.failureReason ?? null);
  }

  @Get('payouts/due')
  duePayouts() {
    return this.due.execute();
  }

  /** Depósitos pendientes hace más de N minutos, para que el gateway los concilie. */
  @Get('payouts/stuck')
  stuckPayouts(@Query('olderThanMinutes') olderThanMinutes?: string) {
    return this.stuck.execute(Number(olderThanMinutes ?? 10));
  }
}
