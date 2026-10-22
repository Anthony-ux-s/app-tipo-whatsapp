import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { InternalTokenGuard } from '../../../http/internal-token.guard';
import { Public } from '../../../http/public.decorator';
import { GetInternalIntegrationUseCase, type InternalIntegration } from './stores.use-cases';

/** Para el gateway: con qué API atender una tienda (la clave de tienda es su id). Solo entre servicios. */
@Public()
@SkipThrottle()
@UseGuards(InternalTokenGuard)
@Controller('internal/integrations')
export class InternalIntegrationsController {
  constructor(private readonly integration: GetInternalIntegrationUseCase) {}

  @Get(':storeKey')
  get(@Param('storeKey') storeKey: string): Promise<InternalIntegration> {
    return this.integration.execute(storeKey);
  }
}
