import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { TokenService } from './token-service.port';

@Injectable()
export class JwtTokenService implements TokenService {
  constructor(private readonly jwt: JwtService) {}

  issue(userId: string): Promise<string> {
    return this.jwt.signAsync({ sub: userId });
  }

  async verify(token: string): Promise<string | null> {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
      return payload.sub ?? null;
    } catch {
      return null;
    }
  }
}
