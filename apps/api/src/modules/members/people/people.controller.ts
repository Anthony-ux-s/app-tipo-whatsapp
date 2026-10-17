import { Controller, Get, Query } from '@nestjs/common';
import type { PublicUser } from '@parla/types';
import { CurrentUser, type AuthUser } from '../../../http/current-user.decorator';
import { SearchPeopleUseCase } from '../../platform/identity/auth/use-cases/search-people.use-case';

/** Directorio de personas de Parla, para empezar un chat o armar un grupo. */
@Controller('people')
export class PeopleController {
  constructor(private readonly searchPeople: SearchPeopleUseCase) {}

  @Get()
  search(@CurrentUser() user: AuthUser, @Query('q') query?: string): Promise<PublicUser[]> {
    return this.searchPeople.execute(user.userId, query ?? '');
  }
}
