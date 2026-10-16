export interface DemoAccount {
  identifier: string;
  name: string;
  role: string;
  color: string;
}

export interface AuthHighlight {
  title: string;
  text: string;
}

export type RegisterMethod = 'phone' | 'username';

export interface RegisterErrors {
  displayName?: string | null;
  phone?: string | null;
  username?: string | null;
  password?: string | null;
  form?: string | null;
}
