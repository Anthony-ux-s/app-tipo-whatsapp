import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { ContactMatch, PublicUser } from '@parla/types';
import { CurrentUser, type AuthUser } from '../../../http/current-user.decorator';
import { MatchContactsDto } from '../../platform/identity/auth/dto/auth.dto';
import { MatchContactsUseCase } from '../../platform/identity/auth/use-cases/match-contacts.use-case';
import { SearchPeopleUseCase } from '../../platform/identity/auth/use-cases/search-people.use-case';

/** Directorio de personas de Parla, para empezar un chat o armar un grupo. */
@Controller('people')
export class PeopleController {
  constructor(
    private readonly searchPeople: SearchPeopleUseCase,
    private readonly matchContacts: MatchContactsUseCase,
  ) {}

  @Get()
  search(@CurrentUser() user: AuthUser, @Query('q') query?: string): Promise<PublicUser[]> {
    return this.searchPeople.execute(user.userId, query ?? '');
  }

  /** Quiénes de la libreta del teléfono ya están en Parla (los números no se guardan). */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('match')
  match(@CurrentUser() user: AuthUser, @Body() body: MatchContactsDto): Promise<ContactMatch[]> {
    return this.matchContacts.execute(user.userId, body.phones);
  }
}
