import type { DeliveryAddress, SavedAddress } from '@parla/types';

/** Direcciones de entrega de cada persona: se recuerdan solas al pedir (las más recientes primero). */
export interface AddressesRepository {
  list(userId: string, limit: number): Promise<SavedAddress[]>;
  /** Guarda (o marca como usada) la dirección y deja solo las `keep` más recientes. */
  remember(userId: string, address: DeliveryAddress, at: Date, keep: number): Promise<void>;
  setLabel(userId: string, id: string, label: string): Promise<SavedAddress | null>;
  /** false si no existía o era de otra persona. */
  delete(userId: string, id: string): Promise<boolean>;
}

export const ADDRESSES_REPOSITORY = Symbol('ADDRESSES_REPOSITORY');
