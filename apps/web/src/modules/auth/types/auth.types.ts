export interface AuthHighlight {
  title: string;
  text: string;
}

/** Pasos del registro antes de tener cuenta. */
export type RegisterStep = 'phone' | 'code' | 'details';

export interface RegisterErrors {
  displayName?: string | null;
  phone?: string | null;
  code?: string | null;
  username?: string | null;
  password?: string | null;
  form?: string | null;
}
