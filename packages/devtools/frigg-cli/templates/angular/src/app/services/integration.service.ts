import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Integration } from '../models/integration.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class IntegrationService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  async getIntegrations(): Promise<Integration[]> {
    try {
      const integrations = await firstValueFrom(
        this.http.get<Integration[]>(`${this.apiUrl}/integrations/all`)
      );
      return integrations || this.getMockIntegrations();
    } catch (error) {
      console.warn('API not available, using mock data');
      return this.getMockIntegrations();
    }
  }

  async getIntegrationById(id: string): Promise<Integration> {
    try {
      return await firstValueFrom(
        this.http.get<Integration>(`${this.apiUrl}/integrations/${id}`)
      );
    } catch (error) {
      console.warn('API not available, using mock data');
      return this.getMockIntegration(id);
    }
  }

  async createIntegration(integration: Partial<Integration>): Promise<Integration> {
    return await firstValueFrom(
      this.http.post<Integration>(`${this.apiUrl}/integrations`, integration)
    );
  }

  async updateIntegration(id: string, integration: Partial<Integration>): Promise<Integration> {
    return await firstValueFrom(
      this.http.put<Integration>(`${this.apiUrl}/integrations/${id}`, integration)
    );
  }

  async deleteIntegration(id: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(`${this.apiUrl}/integrations/${id}`)
    );
  }

  private getMockIntegrations(): Integration[] {
    return [
      {
        id: '1',
        name: 'HubSpot',
        description: 'Customer relationship management platform',
        enabled: true,
        status: 'connected',
        logoUrl: '/assets/logos/hubspot.svg',
        webhookUrl: 'https://api.myapp.com/webhooks/hubspot',
        apiCalls: 127
      },
      {
        id: '2',
        name: 'Salesforce',
        description: 'Sales and customer service platform',
        enabled: false,
        status: 'disconnected',
        logoUrl: '/assets/logos/salesforce.svg'
      }
    ];
  }

  private getMockIntegration(id: string): Integration {
    return {
      id,
      name: 'HubSpot',
      description: 'Customer relationship management platform',
      enabled: true,
      status: 'connected',
      logoUrl: '/assets/logos/hubspot.svg',
      webhookUrl: 'https://api.myapp.com/webhooks/hubspot',
      apiCalls: 127
    };
  }
}