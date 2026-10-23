import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_ENV, loadEnv, type AppEnv } from '../config/env.validation';
import { ACCOUNT_ACCESS } from './identity/account-access.port';
import { BcryptPasswordHasher } from './identity/bcrypt-password-hasher.adapter';
import { JwtTokenService } from './identity/jwt-token-service.adapter';
import { PASSWORD_HASHER } from './identity/password-hasher.port';
import { PrismaAccountAccess } from './identity/prisma-account-access.adapter';
import { TOKEN_SERVICE } from './identity/token-service.port';
import { PrismaService } from './prisma/prisma.service';
import { BrevoSender } from './messaging/brevo-sender.adapter';
import { ComposedSender } from './messaging/composed-sender.adapter';
import { DevConsoleSender } from './messaging/dev-console-sender.adapter';
import { OneSignalSender } from './messaging/onesignal-sender.adapter';
import { VERIFICATION_SENDER } from './messaging/verification-sender.port';
import { PUSH_SENDER } from './push/push-sender.port';
import { WebPushSender } from './push/web-push-sender.adapter';
import { PresenceRegistry } from './realtime/presence.registry';
import { REALTIME_PUBLISHER } from './realtime/realtime-publisher.port';
import { ElixirRealtimePublisher } from './realtime/elixir-realtime-publisher.adapter';
import { FILE_STORAGE } from './storage/file-storage.port';
import { LocalDiskFileStorage } from './storage/local-disk-file-storage.adapter';

const env = loadEnv();

/** Enchufa cada puerto con su adaptador. Cambiar de proveedor = cambiar una línea aquí. */
@Global()
@Module({
  imports: [JwtModule.register({ secret: env.jwtSecret, signOptions: { expiresIn: env.jwtExpiresIn as never } })],
  providers: [
    { provide: APP_ENV, useValue: env satisfies AppEnv },
    PrismaService,
    PresenceRegistry,
    { provide: PASSWORD_HASHER, useClass: BcryptPasswordHasher },
    { provide: TOKEN_SERVICE, useClass: JwtTokenService },
    { provide: ACCOUNT_ACCESS, useClass: PrismaAccountAccess },
    { provide: FILE_STORAGE, useClass: LocalDiskFileStorage },
    // El tiempo real vive en el servicio de Elixir (services/realtime).
    { provide: REALTIME_PUBLISHER, useClass: ElixirRealtimePublisher },
    { provide: PUSH_SENDER, useClass: WebPushSender },
    // Códigos por SMS y correo. SMS: OneSignal. Correo: Brevo (gratis) o, si no, OneSignal. Sin credenciales, modo de
    // prueba en desarrollo (el código vuelve a la pantalla).
    {
      provide: VERIFICATION_SENDER,
      useFactory: () => {
        const sms = env.oneSignal ? new OneSignalSender(env) : new DevConsoleSender();
        const email = env.brevo ? new BrevoSender(env) : sms;
        return new ComposedSender(sms, email);
      },
    },
  ],
  exports: [
    APP_ENV,
    PrismaService,
    PresenceRegistry,
    PASSWORD_HASHER,
    TOKEN_SERVICE,
    ACCOUNT_ACCESS,
    FILE_STORAGE,
    REALTIME_PUBLISHER,
    PUSH_SENDER,
    VERIFICATION_SENDER,
  ],
})
export class InfraModule {}
