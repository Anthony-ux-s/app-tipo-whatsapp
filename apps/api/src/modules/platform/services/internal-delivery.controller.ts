import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { DeliveryQuoteBreakdown } from '@parla/types';
import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsOptional, ValidateNested } from 'class-validator';
import { InternalTokenGuard } from '../../../http/internal-token.guard';
import { Public } from '../../../http/public.decorator';
import { QuoteDeliveryUseCase } from './use-cases/logistics.use-cases';

class PointDto {
  @IsLatitude() lat: number;
  @IsLongitude() lng: number;
}

class DeliveryQuoteDto {
  @IsOptional() @ValidateNested() @Type(() => PointDto) pickup?: PointDto | null;
  @IsOptional() @ValidateNested() @Type(() => PointDto) dropoff?: PointDto | null;
}

/** Para el gateway: la tarifa del delivery (la configura soporte) al cotizar un pedido. */
@Public()
@SkipThrottle()
@UseGuards(InternalTokenGuard)
@Controller('internal/delivery')
export class InternalDeliveryController {
  constructor(private readonly quote: QuoteDeliveryUseCase) {}

  @HttpCode(200)
  @Post('quote')
  quoteDelivery(@Body() body: DeliveryQuoteDto): Promise<DeliveryQuoteBreakdown> {
    return this.quote.execute(body.pickup ?? null, body.dropoff ?? null);
  }
}
