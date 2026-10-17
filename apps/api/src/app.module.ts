import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AccountThrottlerGuard } from './http/account-throttler.guard';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard } from './http/jwt-auth.guard';
import { InfraModule } from './infra/infra.module';
import { CallsModule } from './modules/members/calls/calls.module';
import { ChatsModule } from './modules/members/chats/chats.module';
import { OrdersModule } from './modules/members/orders/orders.module';
import { PeopleModule } from './modules/members/people/people.module';
import { PushModule } from './modules/members/push/push.module';
import { TasksModule } from './modules/members/tasks/tasks.module';
import { AuthModule } from './modules/platform/identity/auth/auth.module';
import { RealtimeBridgeModule } from './modules/platform/messaging/realtime-bridge/realtime-bridge.module';
import { ServicesBridgeModule } from './modules/platform/services/services-bridge.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    InfraModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }]),
    AuthModule,
    PeopleModule,
    ChatsModule,
    TasksModule,
    PushModule,
    OrdersModule,
    RealtimeBridgeModule,
    ServicesBridgeModule,
    CallsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: AccountThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
