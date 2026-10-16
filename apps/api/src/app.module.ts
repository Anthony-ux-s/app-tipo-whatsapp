import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard } from './http/jwt-auth.guard';
import { InfraModule } from './infra/infra.module';
import { WorkspaceAdminModule } from './modules/admin/workspace-admin/workspace-admin.module';
import { ChatsModule } from './modules/members/chats/chats.module';
import { InvitesModule } from './modules/members/invites/invites.module';
import { WorkspacesModule } from './modules/members/workspaces/workspaces.module';
import { AuthModule } from './modules/platform/identity/auth/auth.module';
import { LiveModule } from './modules/platform/messaging/live/live.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    InfraModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }]),
    AuthModule,
    WorkspacesModule,
    InvitesModule,
    ChatsModule,
    WorkspaceAdminModule,
    LiveModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
