import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { AppliedCoupon, InternalCouponQuote } from '@parla/types';
import { IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';
import { InternalTokenGuard } from '../../../http/internal-token.guard';
import { Public } from '../../../http/public.decorator';
import { IsAdminUseCase } from './use-cases/admin-orders.use-cases';
import { QuoteCouponUseCase } from './use-cases/coupons.use-cases';

const MAX_CENTS = 10_000_000;

class CouponQuoteDto implements InternalCouponQuote {
  @IsString() @IsNotEmpty() @MaxLength(30) code: string;
  @IsString() @IsNotEmpty() @MaxLength(64) userId: string;
  @IsInt() @Min(0) @Max(MAX_CENTS) subtotalCents: number;
  @IsInt() @Min(0) @Max(MAX_CENTS) deliveryFeeCents: number;
}

/**
 * Para el gateway: cuánto descuenta un cupón al cotizar, y si una cuenta es de soporte (para cancelar
 * con devolución un pedido trabado). Solo entre servicios, con el token interno.
 */
@Public()
@SkipThrottle()
@UseGuards(InternalTokenGuard)
@Controller('internal')
export class InternalCouponsController {
  constructor(
    private readonly quote: QuoteCouponUseCase,
    private readonly isAdmin: IsAdminUseCase,
  ) {}

  @HttpCode(200)
  @Post('coupons/quote')
  quoteCoupon(@Body() body: CouponQuoteDto): Promise<AppliedCoupon> {
    return this.quote.execute(body);
  }

  @Get('users/:id/admin')
  admin(@Param('id') id: string): Promise<{ isAdmin: boolean }> {
    return this.isAdmin.execute(id);
  }
}
