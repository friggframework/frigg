export interface Integration {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  status: 'connected' | 'disconnected' | 'error';
  logoUrl?: string;
  webhookUrl?: string;
  apiCalls?: number;
  lastSync?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}