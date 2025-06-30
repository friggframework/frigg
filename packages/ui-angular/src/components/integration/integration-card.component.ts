/**
 * Angular Integration Card Component
 * Displays integration information in a card format
 */

import { 
  Component, 
  Input, 
  Output, 
  EventEmitter,
  ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';

export interface IntegrationEntity {
  id: string;
  type: string;
  name: string;
  icon?: string;
  status: 'connected' | 'disconnected' | 'error';
}

export interface Integration {
  id: string;
  name: string;
  description?: string;
  entities: IntegrationEntity[];
  status: 'active' | 'inactive' | 'error' | 'pending';
  lastSync?: Date;
  config?: any;
  metrics?: {
    syncedRecords?: number;
    errors?: number;
    lastError?: string;
  };
}

@Component({
  selector: 'frigg-integration-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div 
      class="frigg-integration-card"
      [class.frigg-integration-card--active]="integration.status === 'active'"
      [class.frigg-integration-card--error]="integration.status === 'error'"
      [class.frigg-integration-card--clickable]="clickable"
      (click)="handleClick()"
    >
      <div class="frigg-integration-card__header">
        <div class="frigg-integration-card__entities">
          <div 
            *ngFor="let entity of integration.entities; let i = index"
            class="frigg-integration-card__entity"
          >
            <img 
              *ngIf="entity.icon" 
              [src]="entity.icon" 
              [alt]="entity.name"
              class="frigg-integration-card__entity-icon"
            >
            <span class="frigg-integration-card__entity-name">{{ entity.name }}</span>
            <svg 
              *ngIf="i < integration.entities.length - 1"
              class="frigg-integration-card__arrow"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path fill-rule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
          </div>
        </div>
        
        <div class="frigg-integration-card__status">
          <span 
            class="frigg-integration-card__status-badge"
            [class.frigg-integration-card__status-badge--active]="integration.status === 'active'"
            [class.frigg-integration-card__status-badge--error]="integration.status === 'error'"
            [class.frigg-integration-card__status-badge--pending]="integration.status === 'pending'"
          >
            {{ getStatusText(integration.status) }}
          </span>
        </div>
      </div>

      <div class="frigg-integration-card__content">
        <h3 class="frigg-integration-card__title">{{ integration.name }}</h3>
        <p class="frigg-integration-card__description" *ngIf="integration.description">
          {{ integration.description }}
        </p>
      </div>

      <div class="frigg-integration-card__metrics" *ngIf="showMetrics && integration.metrics">
        <div class="frigg-integration-card__metric">
          <span class="frigg-integration-card__metric-label">Synced Records</span>
          <span class="frigg-integration-card__metric-value">
            {{ integration.metrics.syncedRecords || 0 | number }}
          </span>
        </div>
        <div class="frigg-integration-card__metric" *ngIf="integration.lastSync">
          <span class="frigg-integration-card__metric-label">Last Sync</span>
          <span class="frigg-integration-card__metric-value">
            {{ getRelativeTime(integration.lastSync) }}
          </span>
        </div>
        <div 
          class="frigg-integration-card__metric" 
          *ngIf="integration.metrics.errors && integration.metrics.errors > 0"
        >
          <span class="frigg-integration-card__metric-label">Errors</span>
          <span class="frigg-integration-card__metric-value frigg-integration-card__metric-value--error">
            {{ integration.metrics.errors }}
          </span>
        </div>
      </div>

      <div class="frigg-integration-card__actions" *ngIf="showActions">
        <button 
          class="frigg-integration-card__action"
          (click)="handleConfigure($event)"
          [disabled]="actionsDisabled"
        >
          Configure
        </button>
        <button 
          class="frigg-integration-card__action frigg-integration-card__action--secondary"
          (click)="handleView($event)"
          [disabled]="actionsDisabled"
        >
          View Details
        </button>
        <button 
          *ngIf="integration.status === 'active'"
          class="frigg-integration-card__action frigg-integration-card__action--secondary"
          (click)="handleSync($event)"
          [disabled]="actionsDisabled"
        >
          Sync Now
        </button>
      </div>
    </div>
  `,
  styles: [`
    .frigg-integration-card {
      background: white;
      border: 1px solid #E5E7EB;
      border-radius: 12px;
      padding: 20px;
      transition: all 0.2s ease;
    }

    .frigg-integration-card--clickable {
      cursor: pointer;
    }

    .frigg-integration-card--clickable:hover {
      border-color: #D1D5DB;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    }

    .frigg-integration-card--active {
      border-color: #10B981;
    }

    .frigg-integration-card--error {
      border-color: #EF4444;
      background: #FEF2F2;
    }

    /* Header */
    .frigg-integration-card__header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .frigg-integration-card__entities {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .frigg-integration-card__entity {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .frigg-integration-card__entity-icon {
      width: 24px;
      height: 24px;
      border-radius: 4px;
    }

    .frigg-integration-card__entity-name {
      font-size: 14px;
      font-weight: 500;
      color: #374151;
    }

    .frigg-integration-card__arrow {
      width: 16px;
      height: 16px;
      color: #9CA3AF;
    }

    /* Status */
    .frigg-integration-card__status-badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 500;
      background: #F3F4F6;
      color: #6B7280;
    }

    .frigg-integration-card__status-badge--active {
      background: #D1FAE5;
      color: #065F46;
    }

    .frigg-integration-card__status-badge--error {
      background: #FEE2E2;
      color: #991B1B;
    }

    .frigg-integration-card__status-badge--pending {
      background: #FEF3C7;
      color: #92400E;
    }

    /* Content */
    .frigg-integration-card__content {
      margin-bottom: 16px;
    }

    .frigg-integration-card__title {
      font-size: 16px;
      font-weight: 600;
      color: #111827;
      margin: 0 0 8px 0;
    }

    .frigg-integration-card__description {
      font-size: 14px;
      color: #6B7280;
      margin: 0;
    }

    /* Metrics */
    .frigg-integration-card__metrics {
      display: flex;
      gap: 24px;
      padding: 16px 0;
      border-top: 1px solid #E5E7EB;
      border-bottom: 1px solid #E5E7EB;
      margin-bottom: 16px;
    }

    .frigg-integration-card__metric {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .frigg-integration-card__metric-label {
      font-size: 12px;
      color: #6B7280;
    }

    .frigg-integration-card__metric-value {
      font-size: 16px;
      font-weight: 600;
      color: #111827;
    }

    .frigg-integration-card__metric-value--error {
      color: #EF4444;
    }

    /* Actions */
    .frigg-integration-card__actions {
      display: flex;
      gap: 12px;
    }

    .frigg-integration-card__action {
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      background: #3B82F6;
      color: white;
      border: 1px solid #3B82F6;
    }

    .frigg-integration-card__action:hover {
      background: #2563EB;
      border-color: #2563EB;
    }

    .frigg-integration-card__action:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .frigg-integration-card__action--secondary {
      background: white;
      color: #374151;
      border-color: #D1D5DB;
    }

    .frigg-integration-card__action--secondary:hover {
      background: #F9FAFB;
      border-color: #9CA3AF;
    }

    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      .frigg-integration-card {
        background: #1F2937;
        border-color: #374151;
      }

      .frigg-integration-card--error {
        background: #7F1D1D;
      }

      .frigg-integration-card__entity-name {
        color: #D1D5DB;
      }

      .frigg-integration-card__title {
        color: white;
      }

      .frigg-integration-card__description {
        color: #9CA3AF;
      }

      .frigg-integration-card__metrics {
        border-color: #374151;
      }

      .frigg-integration-card__metric-label {
        color: #9CA3AF;
      }

      .frigg-integration-card__metric-value {
        color: white;
      }

      .frigg-integration-card__action--secondary {
        background: #374151;
        color: white;
        border-color: #4B5563;
      }

      .frigg-integration-card__action--secondary:hover {
        background: #4B5563;
        border-color: #6B7280;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FriggIntegrationCardComponent {
  @Input() integration!: Integration;
  @Input() showMetrics: boolean = true;
  @Input() showActions: boolean = true;
  @Input() clickable: boolean = false;
  @Input() actionsDisabled: boolean = false;
  
  @Output() click = new EventEmitter<Integration>();
  @Output() configure = new EventEmitter<Integration>();
  @Output() view = new EventEmitter<Integration>();
  @Output() sync = new EventEmitter<Integration>();

  handleClick(): void {
    if (this.clickable) {
      this.click.emit(this.integration);
    }
  }

  handleConfigure(event: Event): void {
    event.stopPropagation();
    this.configure.emit(this.integration);
  }

  handleView(event: Event): void {
    event.stopPropagation();
    this.view.emit(this.integration);
  }

  handleSync(event: Event): void {
    event.stopPropagation();
    this.sync.emit(this.integration);
  }

  getStatusText(status: string): string {
    const statusMap: Record<string, string> = {
      active: 'Active',
      inactive: 'Inactive',
      error: 'Error',
      pending: 'Pending'
    };
    return statusMap[status] || status;
  }

  getRelativeTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  }
}