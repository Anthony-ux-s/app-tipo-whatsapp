import { Module } from '@nestjs/common';
import { CallsEngineModule } from '../../platform/messaging/calls/calls-engine.module';
import { CallsController } from './calls.controller';
import { CallsGateway } from './calls.gateway';

@Module({
  imports: [CallsEngineModule],
  controllers: [CallsController],
  providers: [CallsGateway],
})
export class CallsModule {}
