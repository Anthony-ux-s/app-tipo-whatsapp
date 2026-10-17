export interface Country {
  iso: string;
  name: string;
  /** Indicativo sin «+». */
  code: string;
  flag: string;
  example: string;
}

/** Países de la región primero (Parla nace en Latinoamérica), luego España y Estados Unidos. */
export const COUNTRIES: Country[] = [
  { iso: 'PE', name: 'Perú', code: '51', flag: '🇵🇪', example: '987 654 321' },
  { iso: 'CO', name: 'Colombia', code: '57', flag: '🇨🇴', example: '300 123 4567' },
  { iso: 'MX', name: 'México', code: '52', flag: '🇲🇽', example: '55 1234 5678' },
  { iso: 'AR', name: 'Argentina', code: '54', flag: '🇦🇷', example: '11 2345 6789' },
  { iso: 'CL', name: 'Chile', code: '56', flag: '🇨🇱', example: '9 1234 5678' },
  { iso: 'EC', name: 'Ecuador', code: '593', flag: '🇪🇨', example: '99 123 4567' },
  { iso: 'BO', name: 'Bolivia', code: '591', flag: '🇧🇴', example: '7123 4567' },
  { iso: 'VE', name: 'Venezuela', code: '58', flag: '🇻🇪', example: '412 123 4567' },
  { iso: 'UY', name: 'Uruguay', code: '598', flag: '🇺🇾', example: '94 123 456' },
  { iso: 'PY', name: 'Paraguay', code: '595', flag: '🇵🇾', example: '961 123 456' },
  { iso: 'BR', name: 'Brasil', code: '55', flag: '🇧🇷', example: '11 91234 5678' },
  { iso: 'CR', name: 'Costa Rica', code: '506', flag: '🇨🇷', example: '8312 3456' },
  { iso: 'PA', name: 'Panamá', code: '507', flag: '🇵🇦', example: '6123 4567' },
  { iso: 'GT', name: 'Guatemala', code: '502', flag: '🇬🇹', example: '5123 4567' },
  { iso: 'SV', name: 'El Salvador', code: '503', flag: '🇸🇻', example: '7012 3456' },
  { iso: 'HN', name: 'Honduras', code: '504', flag: '🇭🇳', example: '9123 4567' },
  { iso: 'NI', name: 'Nicaragua', code: '505', flag: '🇳🇮', example: '8123 4567' },
  { iso: 'DO', name: 'República Dominicana', code: '1809', flag: '🇩🇴', example: '234 5678' },
  { iso: 'ES', name: 'España', code: '34', flag: '🇪🇸', example: '612 34 56 78' },
  { iso: 'US', name: 'Estados Unidos', code: '1', flag: '🇺🇸', example: '201 555 0123' },
];

/** País por el idioma del navegador (es-PE → Perú); si no se reconoce, Colombia. */
export function defaultCountry(language = typeof navigator === 'undefined' ? '' : navigator.language): Country {
  const region = language.split('-')[1]?.toUpperCase();
  return COUNTRIES.find((c) => c.iso === region) ?? COUNTRIES.find((c) => c.iso === 'CO')!;
}

/** Indicativo + número local → E.164 («57», «300 123 4567» → «+573001234567»). */
export function toE164(country: Country, local: string): string {
  return `+${country.code}${local.replace(/\D/g, '').replace(/^0+/, '')}`;
}
