import { Body, Controller, Delete, Get, HttpCode, Param, Patch } from '@nestjs/common';
import type { SavedAddress, UpdateSavedAddressRequest } from '@parla/types';
import { IsString, MaxLength } from 'class-validator';
import { CurrentUser, type AuthUser } from '../../../http/current-user.decorator';
import { DeleteAddressUseCase, LabelAddressUseCase, ListMyAddressesUseCase } from '../../platform/services/use-cases/addresses.use-cases';

class LabelDto implements UpdateSavedAddressRequest {
  @IsString() @MaxLength(30) label: string;
}

/** «Mis direcciones»: se guardan solas al pedir; aquí se les pone nombre o se borran. */
@Controller('addresses')
export class AddressesController {
  constructor(
    private readonly listMine: ListMyAddressesUseCase,
    private readonly label: LabelAddressUseCase,
    private readonly remove: DeleteAddressUseCase,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<SavedAddress[]> {
    return this.listMine.execute(user.userId);
  }

  @Patch(':id')
  rename(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: LabelDto): Promise<SavedAddress> {
    return this.label.execute(user.userId, id, body.label);
  }

  @HttpCode(204)
  @Delete(':id')
  async delete(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.remove.execute(user.userId, id);
  }
}
