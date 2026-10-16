import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_ENV, loadEnv, type AppEnv } from '../config/env.validation';
import { BcryptPasswordHasher } from './identity/bcrypt-password-hasher.adapter';
import { JwtTokenService } from './identity/jwt-token-service.adapter';
import { PASSWORD_HASHER } from './identity/password-hasher.port';
import { TOKEN_SERVICE } from './identity/token-service.port';
import { PrismaService } from './prisma/prisma.service';
import { MercadoPagoPaymentGateway } from './payments/mercadopago-payment-gateway.adapter';
import { PAYMENT_GATEWAY } from './payments/payment-gateway.port';
import { SandboxPaymentGateway } from './payments/sandbox-payment-gateway.adapter';
import { PUSH_SENDER } from './push/push-sender.port';
import { WebPushSender } from './push/web-push-sender.adapter';
import { PresenceRegistry } from './realtime/presence.registry';
import { REALTIME_PUBLISHER } from './realtime/realtime-publisher.port';
import { SocketIoRealtimePublisher } from './realtime/socket-io-realtime-publisher.adapter';
import { SocketServerHolder } from './realtime/socket-server.holder';
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
    SocketServerHolder,
    PresenceRegistry,
    { provide: PASSWORD_HASHER, useClass: BcryptPasswordHasher },
    { provide: TOKEN_SERVICE, useClass: JwtTokenService },
    { provide: FILE_STORAGE, useClass: LocalDiskFileStorage },
    { provide: REALTIME_PUBLISHER, useClass: SocketIoRealtimePublisher },
    { provide: PUSH_SENDER, useClass: WebPushSender },
    // Pasarela de pago según PAYMENT_PROVIDER: sandbox (por defecto, no cobra) o mercadopago.
    { provide: PAYMENT_GATEWAY, useClass: env.paymentProvider === 'mercadopago' ? MercadoPagoPaymentGateway : SandboxPaymentGateway },
  ],
  exports: [
    APP_ENV,
    PrismaService,
    SocketServerHolder,
    PresenceRegistry,
    PASSWORD_HASHER,
    TOKEN_SERVICE,
    FILE_STORAGE,
    REALTIME_PUBLISHER,
    PUSH_SENDER,
    PAYMENT_GATEWAY,
  ],
})
export class InfraModule {}
