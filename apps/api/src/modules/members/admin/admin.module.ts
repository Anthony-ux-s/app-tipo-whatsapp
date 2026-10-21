import { Module } from '@nestjs/common';
import { OrdersEngineModule } from '../../platform/services/orders-engine.module';
import { AdminController } from './admin.controller';
import { PhotosController } from './photos.controller';

@Module({
  imports: [OrdersEngineModule],
  controllers: [AdminController, PhotosController],
})
export class AdminModule {}
