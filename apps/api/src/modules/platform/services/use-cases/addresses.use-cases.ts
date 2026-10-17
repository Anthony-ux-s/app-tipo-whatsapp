import { Inject, Injectable } from '@nestjs/common';
import type { SavedAddress } from '@parla/types';
import { NotFoundError } from '../../../../kernel/domain-error';
import { ADDRESSES_REPOSITORY, type AddressesRepository } from '../addresses.repository';

/** Cuántas direcciones se recuerdan por persona (las más usadas recientemente). */
export const SAVED_ADDRESSES_LIMIT = 8;

/** «Mis direcciones»: las que usó para pedir, la más reciente primero. */
@Injectable()
export class ListMyAddressesUseCase {
  constructor(@Inject(ADDRESSES_REPOSITORY) private readonly addresses: AddressesRepository) {}

  execute(userId: string): Promise<SavedAddress[]> {
    return this.addresses.list(userId, SAVED_ADDRESSES_LIMIT);
  }
}

/** Ponerle nombre («Casa», «Trabajo») a una dirección guardada, o quitárselo. */
@Injectable()
export class LabelAddressUseCase {
  constructor(@Inject(ADDRESSES_REPOSITORY) private readonly addresses: AddressesRepository) {}

  async execute(userId: string, id: string, label: string): Promise<SavedAddress> {
    const updated = await this.addresses.setLabel(userId, id, label.trim().slice(0, 30));
    if (!updated) throw new NotFoundError('Dirección no encontrada');
    return updated;
  }
}

@Injectable()
export class DeleteAddressUseCase {
  constructor(@Inject(ADDRESSES_REPOSITORY) private readonly addresses: AddressesRepository) {}

  async execute(userId: string, id: string): Promise<void> {
    if (!(await this.addresses.delete(userId, id))) throw new NotFoundError('Dirección no encontrada');
  }
}
