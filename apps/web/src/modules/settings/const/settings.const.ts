import type { ThemePreference } from '@parla/types';
import { Bell, FileLock2, MessageSquareText, Palette, ShieldCheck, UserRound, type LucideIcon } from 'lucide-react';

export const THEME_OPTIONS: { id: ThemePreference; label: string }[] = [
  { id: 'light', label: 'Claro' },
  { id: 'dark', label: 'Oscuro' },
  { id: 'system', label: 'Sistema' },
];

export type SettingsSectionId = 'perfil' | 'apariencia' | 'chats' | 'notificaciones' | 'privacidad' | 'datos';

export interface SettingsSectionInfo {
  id: SettingsSectionId;
  title: string;
  /** Resumen que se ve en la lista de Ajustes. */
  summary: string;
  /** Explicación bajo el título de la página de la sección. */
  description: string;
  icon: LucideIcon;
}

export const SETTINGS_SECTIONS: Record<SettingsSectionId, SettingsSectionInfo> = {
  perfil: {
    id: 'perfil',
    title: 'Perfil',
    summary: 'Foto, nombre, usuario y correo de recuperación',
    description: 'Así te ven tus contactos en los chats y al buscarte en Parla.',
    icon: UserRound,
  },
  privacidad: {
    id: 'privacidad',
    title: 'Privacidad y seguridad',
    summary: 'Cifrado de extremo a extremo y tu huella',
    description: 'Cómo protegemos tus mensajes y cómo comprobar que nadie se interpone.',
    icon: ShieldCheck,
  },
  datos: {
    id: 'datos',
    title: 'Tus datos',
    summary: 'Descargar una copia o eliminar tu cuenta',
    description: 'Tus derechos sobre tus datos personales (Ley 1581 de 2012 y LGPD).',
    icon: FileLock2,
  },
  apariencia: {
    id: 'apariencia',
    title: 'Apariencia',
    summary: 'Tema claro, oscuro o el del sistema',
    description: 'Elige cómo se ve Parla en este dispositivo y en los demás donde entres.',
    icon: Palette,
  },
  chats: {
    id: 'chats',
    title: 'Chats',
    summary: 'Enviar con Enter, sonidos y efectos',
    description: 'Cómo escribes y cómo te enteras de lo que llega.',
    icon: MessageSquareText,
  },
  notificaciones: {
    id: 'notificaciones',
    title: 'Notificaciones',
    summary: 'Avisos push en este dispositivo',
    description: 'Entérate de mensajes, menciones y llamadas aunque Parla esté cerrada.',
    icon: Bell,
  },
};

/** Secciones de la pantalla principal de Ajustes, en orden (una sola lista, sin títulos de grupo). */
export const SETTINGS_HOME_SECTIONS: SettingsSectionId[] = ['privacidad', 'datos', 'apariencia', 'chats', 'notificaciones'];

export const LEGAL_LINKS = [
  { to: '/legal/terminos', label: 'Términos y condiciones' },
  { to: '/legal/privacidad', label: 'Política de privacidad' },
];

export function isSettingsSection(value: string | undefined): value is SettingsSectionId {
  return !!value && value in SETTINGS_SECTIONS;
}
