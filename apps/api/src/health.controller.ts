import { Controller, Get } from '@nestjs/common';
import { Public } from './http/public.decorator';
import { PrismaService } from './infra/prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  check() {
    return { status: 'ok', service: 'parla-api' };
  }

  /** Cuánto tarda un viaje a la base desde este servidor (sin datos de nadie): la medida base de toda la mensajería. */
  @Public()
  @Get('db')
  async db() {
    const trips: number[] = [];
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      await this.prisma.$queryRaw`SELECT 1`;
      trips.push(Math.round(performance.now() - start));
    }
    return { status: 'ok', roundTripMs: trips };
  }
}
