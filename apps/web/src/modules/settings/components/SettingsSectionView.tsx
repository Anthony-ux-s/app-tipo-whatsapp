import type { ComponentType } from 'react';
import { Navigate } from 'react-router';
import type { SettingsSectionId } from '../const/settings.const';
import { useSettingsSection } from '../hooks/use-settings.hook';
import { AccountDataSection } from './sections/AccountDataSection';
import { AddressesSection } from './sections/AddressesSection';
import { AppearanceSection, ChatsSection, NotificationsSection } from './sections/PreferenceSections';
import { PrivacySection } from './sections/PrivacySection';
import { SecuritySection } from './sections/SecuritySection';
import { ProfileSection } from './sections/ProfileSection';
import { SectionHeader, SettingsPage } from './SettingsUi';

const SECTION_CONTENT: Record<SettingsSectionId, ComponentType> = {
  perfil: ProfileSection,
  direcciones: AddressesSection,
  apariencia: AppearanceSection,
  chats: ChatsSection,
  notificaciones: NotificationsSection,
  privacidad: PrivacySection,
  seguridad: SecuritySection,
  datos: AccountDataSection,
};

/** Una sección de Ajustes en su propia pantalla (`ajustes/:section`), con botón para volver. */
export function SettingsSectionView() {
  const section = useSettingsSection();
  if (!section) return <Navigate to=".." relative="path" replace />;
  const Content = SECTION_CONTENT[section.id];
  return (
    <SettingsPage>
      <SectionHeader title={section.title} description={section.description} />
      <Content />
    </SettingsPage>
  );
}
