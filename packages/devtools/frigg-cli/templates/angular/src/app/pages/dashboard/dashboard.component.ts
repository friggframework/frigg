import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IntegrationService } from '../../services/integration.service';
import { Integration } from '../../models/integration.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div>
      <h1 class="text-3xl font-bold mb-6">Dashboard</h1>
      
      <div *ngIf="loading" class="flex justify-center items-center h-64">
        <div class="loading-spinner"></div>
      </div>

      <ng-container *ngIf="!loading">
        <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div class="card p-6">
            <h3 class="text-lg font-medium mb-2">Active Integrations</h3>
            <p class="text-3xl font-bold text-primary">{{ stats.active }}</p>
          </div>

          <div class="card p-6">
            <h3 class="text-lg font-medium mb-2">Total Integrations</h3>
            <p class="text-3xl font-bold text-primary">{{ stats.total }}</p>
          </div>

          <div class="card p-6">
            <h3 class="text-lg font-medium mb-2">API Calls Today</h3>
            <p class="text-3xl font-bold text-primary">{{ stats.apiCalls | number }}</p>
          </div>
        </div>

        <div class="mt-8">
          <h2 class="text-xl font-semibold mb-4">Recent Activity</h2>
          <div class="card p-6">
            <p class="text-muted-foreground">No recent activity to display.</p>
          </div>
        </div>
      </ng-container>
    </div>
  `,
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  private integrationService = inject(IntegrationService);

  loading = true;
  integrations: Integration[] = [];
  stats = {
    active: 0,
    total: 0,
    apiCalls: 1234
  };

  ngOnInit() {
    this.loadDashboardData();
  }

  private async loadDashboardData() {
    try {
      this.integrations = await this.integrationService.getIntegrations();
      this.stats.total = this.integrations.length;
      this.stats.active = this.integrations.filter(i => i.enabled).length;
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      this.loading = false;
    }
  }
}