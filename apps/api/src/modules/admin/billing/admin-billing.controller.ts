import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import type { BillingOverview, CheckoutRequest, CheckoutSession, PaidPlanId, SandboxCheckout } from '@parla/types';
import { IsIn } from 'class-validator';
import { CurrentUser, type AuthUser } from '../../../http/current-user.decorator';
import {
  GetBillingOverviewUseCase,
  SandboxCheckoutUseCase,
  StartCheckoutUseCase,
} from '../../platform/billing/use-cases/billing.use-cases';

class CheckoutDto implements CheckoutRequest {
  @IsIn(['team', 'business']) plan: PaidPlanId;
}

/** Puerta del administrador a los planes y pagos de su espacio. */
@Controller('admin/billing')
export class AdminBillingController {
  constructor(
    private readonly overview: GetBillingOverviewUseCase,
    private readonly checkout: StartCheckoutUseCase,
    private readonly sandbox: SandboxCheckoutUseCase,
  ) {}

  @Get('sandbox/:paymentId')
  sandboxView(@CurrentUser() user: AuthUser, @Param('paymentId') paymentId: string): Promise<SandboxCheckout> {
    return this.sandbox.view(user.userId, paymentId);
  }

  @HttpCode(200)
  @Post('sandbox/:paymentId/approve')
  approve(@CurrentUser() user: AuthUser, @Param('paymentId') paymentId: string): Promise<SandboxCheckout> {
    return this.sandbox.complete(user.userId, paymentId, 'approved');
  }

  @HttpCode(200)
  @Post('sandbox/:paymentId/reject')
  reject(@CurrentUser() user: AuthUser, @Param('paymentId') paymentId: string): Promise<SandboxCheckout> {
    return this.sandbox.complete(user.userId, paymentId, 'rejected');
  }

  @Get(':workspaceId')
  get(@CurrentUser() user: AuthUser, @Param('workspaceId') workspaceId: string): Promise<BillingOverview> {
    return this.overview.execute(user.userId, workspaceId);
  }

  @Post(':workspaceId/checkout')
  start(@CurrentUser() user: AuthUser, @Param('workspaceId') workspaceId: string, @Body() body: CheckoutDto): Promise<CheckoutSession> {
    return this.checkout.execute(user.userId, workspaceId, body.plan);
  }
}
