import { Body, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import type { PushSubscriptionRequest } from '@parla/types';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, ValidateNested } from 'class-validator';
import { CurrentUser, type AuthUser } from '../../../http/current-user.decorator';
import { ManageSubscriptionUseCase } from '../../platform/messaging/push/use-cases/manage-subscription.use-case';

class PushKeysDto {
  @IsString() @IsNotEmpty() @MaxLength(200) p256dh: string;
  @IsString() @IsNotEmpty() @MaxLength(100) auth: string;
}

class SubscribeDto implements PushSubscriptionRequest {
  @IsString() @IsNotEmpty() @MaxLength(1000) endpoint: string;
  @ValidateNested() @Type(() => PushKeysDto) keys: PushKeysDto;
}

class UnsubscribeDto {
  @IsString() @IsNotEmpty() @MaxLength(1000) endpoint: string;
}

/** Puerta de cada miembro a sus notificaciones push. */
@Controller('push')
export class PushController {
  constructor(private readonly subscriptions: ManageSubscriptionUseCase) {}

  @Get('public-key')
  publicKey() {
    return this.subscriptions.publicKey();
  }

  @Get('status')
  status(@CurrentUser() user: AuthUser) {
    return this.subscriptions.status(user.userId);
  }

  @Post('subscriptions')
  subscribe(@CurrentUser() user: AuthUser, @Body() body: SubscribeDto) {
    return this.subscriptions.subscribe(user.userId, body);
  }

  @HttpCode(204)
  @Delete('subscriptions')
  unsubscribe(@CurrentUser() user: AuthUser, @Body() body: UnsubscribeDto): Promise<void> {
    return this.subscriptions.unsubscribe(user.userId, body.endpoint);
  }
}
