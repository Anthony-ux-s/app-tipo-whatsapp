import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import type { PasswordHasher } from './password-hasher.port';

@Injectable()
export class BcryptPasswordHasher implements PasswordHasher {
  private readonly rounds = 10;

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.rounds);
  }

  verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
