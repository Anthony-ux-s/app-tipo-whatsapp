import { Module } from '@nestjs/common';
import { AuthModule } from '../../platform/identity/auth/auth.module';
import { PeopleController } from './people.controller';

@Module({
  imports: [AuthModule],
  controllers: [PeopleController],
})
export class PeopleModule {}
