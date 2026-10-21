import type { SavedAddress } from '@parla/types';
import { useEffect, useState } from 'react';
import { http } from '@shared/utils/http';
import { ListSkeleton } from '@shared/ui/States';
import { AddressList } from '../../../services/components/SavedAddresses';
import { SettingsBlock, SettingsGroup } from '../SettingsUi';

export function AddressesSection() {
  const [list, setList] = useState<SavedAddress[] | null>(null);

  useEffect(() => {
    http
      .get<SavedAddress[]>('/addresses')
      .then(setList)
      .catch(() => setList([]));
  }, []);

  return (
    <SettingsGroup title="Mis direcciones" footer="Al pagar un pedido, toca una dirección guardada para usarla.">
      <SettingsBlock>{list ? <AddressList list={list} onChange={setList} /> : <ListSkeleton />}</SettingsBlock>
    </SettingsGroup>
  );
}
