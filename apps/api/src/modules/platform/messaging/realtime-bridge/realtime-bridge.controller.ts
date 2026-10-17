import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { CallKind, PresenceStatus } from '@parla/types';
import { ArrayMaxSize, IsArray, IsIn, IsISO8601, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { InternalTokenGuard } from '../../../../http/internal-token.guard';
import { Public } from '../../../../http/public.decorator';
import {
  ConversationContextUseCase,
  LogCallUseCase,
  NotifyIncomingCallUseCase,
  PresenceChangedUseCase,
  type ConversationContext,
} from './use-cases/realtime-bridge.use-cases';

class PresenceDto {
  @IsString() @IsNotEmpty() userId: string;
  @IsIn(['online', 'offline']) presence: PresenceStatus;
  @IsISO8601() at: string;
}

class CallLogDto {
  @IsString() @IsNotEmpty() conversationId: string;
  @IsString() @IsNotEmpty() actorId: string;
  @IsString() @IsNotEmpty() @MaxLength(200) text: string;
  @IsArray() @ArrayMaxSize(256) @IsString({ each: true }) audience: string[];
}

class CallNotifyDto {
  @IsString() @IsNotEmpty() conversationId: string;
  @IsString() @IsNotEmpty() callerId: string;
  @IsString() @IsNotEmpty() callId: string;
  @IsIn(['audio', 'video']) kind: CallKind;
  @IsArray() @ArrayMaxSize(256) @IsString({ each: true }) recipients: string[];
}

/**
 * Puerta del servicio de tiempo real (Elixir) hacia el core. Solo entre servicios: token interno,
 * sin JWT de persona, y el gateway no la expone hacia fuera.
 */
@Public()
@SkipThrottle()
@UseGuards(InternalTokenGuard)
@Controller('internal')
export class RealtimeBridgeController {
  constructor(
    private readonly presence: PresenceChangedUseCase,
    private readonly context: ConversationContextUseCase,
    private readonly logCall: LogCallUseCase,
    private readonly notifyCall: NotifyIncomingCallUseCase,
  ) {}

  @HttpCode(204)
  @Post('presence')
  async presenceChanged(@Body() body: PresenceDto): Promise<void> {
    await this.presence.execute(body.userId, body.presence, new Date(body.at));
  }

  @Get('conversations/:id/context')
  conversationContext(@Param('id') id: string, @Query('userId') userId: string): Promise<ConversationContext> {
    return this.context.execute(id, userId ?? '');
  }

  @HttpCode(204)
  @Post('calls/log')
  async callLog(@Body() body: CallLogDto): Promise<void> {
    await this.logCall.execute(body.conversationId, body.actorId, body.text, body.audience);
  }

  @HttpCode(204)
  @Post('calls/notify')
  async callNotify(@Body() body: CallNotifyDto): Promise<void> {
    await this.notifyCall.execute(body);
  }
}
