import { Body, Controller, Get, Headers, HttpCode, Post, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Plan } from '@parla/types';
import { Public } from '../../../http/public.decorator';
import { HandlePaymentWebhookUseCase, ListPlansUseCase } from './use-cases/billing.use-cases';

/** Rutas públicas de facturación: catálogo de planes y webhook de la pasarela. */
@Controller('billing')
export class BillingController {
  constructor(
    private readonly listPlans: ListPlansUseCase,
    private readonly webhook: HandlePaymentWebhookUseCase,
  ) {}

  @Public()
  @Get('plans')
  plans(): Plan[] {
    return this.listPlans.execute();
  }

  @Public()
  @SkipThrottle()
  @HttpCode(200)
  @Post('webhooks/mercadopago')
  mercadoPago(
    @Query() query: Record<string, unknown>,
    @Body() body: Record<string, unknown>,
    @Headers() headers: Record<string, string | undefined>,
  ) {
    return this.webhook.execute({ query, body: body ?? {}, headers });
  }
}
