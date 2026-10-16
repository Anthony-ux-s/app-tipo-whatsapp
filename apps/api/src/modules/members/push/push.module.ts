import { Module } from '@nestjs/common';
import { PushEngineModule } from '../../platform/messaging/push/push-engine.module';
import { PushController } from './push.controller';

@Module({
  imports: [PushEngineModule],
  controllers: [PushController],
})
export class PushModule {}
