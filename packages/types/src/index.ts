export * from './contracts/enums.types';
export * from './contracts/identity.types';
export * from './contracts/workspaces.types';
export * from './contracts/messaging.types';
export * from './contracts/realtime.types';
export * from './contracts/billing.types';
export * from './contracts/calls.types';

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
}
