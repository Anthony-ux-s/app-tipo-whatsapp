import { Body, Controller, Delete, Headers, HttpCode, Param, Post, Req, type RawBodyRequest } from '@nestjs/common';
import type { BusinessInfo, FerrohubConnectResult, FerrohubProvisionResult, FerrohubSsoResult } from '@parla/types';
import { SkipThrottle } from '@nestjs/throttler';
import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { CurrentUser, type AuthUser } from '../../../http/current-user.decorator';
import { Public } from '../../../http/public.decorator';
import {
  ConnectFerrohubUseCase,
  DisconnectFerrohubUseCase,
  FerrohubSsoUseCase,
  FerrohubWebhookUseCase,
  ProvisionFerrohubUseCase,
} from '../../platform/stores/ferrohub.use-cases';

class ConnectDto {
  @IsString() @MaxLength(40) code: string;
}

class ProvisionDto {
  @IsString() @MaxLength(120) name: string;
  @IsString() @MaxLength(80) city: string;
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(60, { each: true }) categories?: string[];
  @IsOptional() @IsString() @MaxLength(20) ruc?: string;
  @IsString() @MaxLength(120) ownerName: string;
  @IsString() @MaxLength(160) email: string;
  @IsString() @MaxLength(30) phone: string;
}

/** «Crear tienda» de una ferretería: conectar con el código de enlace de FerroHub o crearla desde Parla. */
@Controller('stores/ferrohub')
export class FerrohubController {
  constructor(
    private readonly connect: ConnectFerrohubUseCase,
    private readonly provision: ProvisionFerrohubUseCase,
  ) {}

  @Post('connect')
  @HttpCode(200)
  connectWithCode(@CurrentUser() user: AuthUser, @Body() body: ConnectDto): Promise<FerrohubConnectResult> {
    return this.connect.execute(user.userId, body.code);
  }

  @Post('provision')
  create(@CurrentUser() user: AuthUser, @Body() body: ProvisionDto): Promise<FerrohubProvisionResult> {
    return this.provision.execute(user.userId, body);
  }
}

/** «Mi negocio» de una tienda conectada: abrir su panel de FerroHub o desvincular. */
@Controller('business/ferrohub')
export class BusinessFerrohubController {
  constructor(
    private readonly sso: FerrohubSsoUseCase,
    private readonly disconnect: DisconnectFerrohubUseCase,
  ) {}

  @Post('sso')
  @HttpCode(200)
  panel(@CurrentUser() user: AuthUser): Promise<FerrohubSsoResult> {
    return this.sso.execute(user.userId);
  }

  @Delete()
  unlink(@CurrentUser() user: AuthUser): Promise<BusinessInfo> {
    return this.disconnect.execute(user.userId);
  }
}

/** Avisos de FerroHub (producto cambiado, tienda cerrada, desvinculada…). Sin sesión: los autentica la firma. */
@Public()
@SkipThrottle()
@Controller('stores')
export class FerrohubWebhookController {
  constructor(private readonly webhook: FerrohubWebhookUseCase) {}

  @Post(':id/ferrohub-events')
  @HttpCode(200)
  receive(
    @Param('id') id: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-ferrohub-signature') signature?: string,
    @Headers('x-ferrohub-timestamp') timestamp?: string,
  ): Promise<{ ok: true; duplicate?: boolean }> {
    return this.webhook.execute(id, req.rawBody?.toString('utf8') ?? '', signature, timestamp);
  }
}
