/**
 * Angular Alerts Panel Component
 * Displays and manages integration alerts with real-time updates
 */

import { 
  Component, 
  Input, 
  OnInit, 
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AlertsService, Alert } from '../../services/alerts.service';
import { FriggLoadingSpinnerComponent } from '../loading/loading-spinner.component';

@Component({
  selector: 'frigg-alerts-panel',
  standalone: true,
  imports: [CommonModule, FriggLoadingSpinnerComponent],
  template: `
    <div class="frigg-alerts-panel">
      <div class="frigg-alerts-panel__header">
        <h2 class="frigg-alerts-panel__title">Alerts</h2>
        <div class="frigg-alerts-panel__actions">
          <button 
            class="frigg-alerts-panel__filter"
            [class.frigg-alerts-panel__filter--active]="activeFilter === filter"
            *ngFor="let filter of filters"
            (click)="setFilter(filter)"
          >
            {{ filter }}
            <span class="frigg-alerts-panel__filter-count" *ngIf="getFilterCount(filter) > 0">
              {{ getFilterCount(filter) }}
            </span>
          </button>
          <button 
            class="frigg-alerts-panel__refresh"
            (click)="refresh()"
            [disabled]="loading"
          >
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      <div class="frigg-alerts-panel__content">
        <frigg-loading-spinner 
          *ngIf="loading && !alerts.length"
          [text]="'Loading alerts...'"
        ></frigg-loading-spinner>

        <div 
          class="frigg-alerts-panel__empty" 
          *ngIf="!loading && filteredAlerts.length === 0"
        >
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
          </svg>
          <p>No alerts found</p>
        </div>

        <div class="frigg-alerts-panel__list" *ngIf="filteredAlerts.length > 0">
          <div 
            *ngFor="let alert of filteredAlerts; trackBy: trackByAlertId"
            class="frigg-alerts-panel__alert"
            [class.frigg-alerts-panel__alert--critical]="alert.severity === 'critical'"
            [class.frigg-alerts-panel__alert--high]="alert.severity === 'high'"
            [class.frigg-alerts-panel__alert--medium]="alert.severity === 'medium'"
            [class.frigg-alerts-panel__alert--low]="alert.severity === 'low'"
            [class.frigg-alerts-panel__alert--acknowledged]="alert.status === 'acknowledged'"
          >
            <div class="frigg-alerts-panel__alert-icon">
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
              </svg>
            </div>
            
            <div class="frigg-alerts-panel__alert-content">
              <h3 class="frigg-alerts-panel__alert-title">{{ alert.title }}</h3>
              <p class="frigg-alerts-panel__alert-description">{{ alert.description }}</p>
              <div class="frigg-alerts-panel__alert-meta">
                <span class="frigg-alerts-panel__alert-time">
                  {{ getRelativeTime(alert.timestamp) }}
                </span>
                <span class="frigg-alerts-panel__alert-severity">
                  {{ alert.severity }}
                </span>
              </div>
            </div>

            <div class="frigg-alerts-panel__alert-actions">
              <button 
                *ngIf="alert.status === 'active'"
                class="frigg-alerts-panel__alert-action"
                (click)="acknowledgeAlert(alert)"
                title="Acknowledge"
              >
                <svg viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
              </button>
              <button 
                *ngIf="alert.status !== 'resolved'"
                class="frigg-alerts-panel__alert-action"
                (click)="resolveAlert(alert)"
                title="Resolve"
              >
                <svg viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="frigg-alerts-panel__footer" *ngIf="showLoadMore && hasMore">
        <button 
          class="frigg-alerts-panel__load-more"
          (click)="loadMore()"
          [disabled]="loading"
        >
          Load More
        </button>
      </div>
    </div>
  `,
  styles: [`
    .frigg-alerts-panel {
      background: white;
      border: 1px solid #E5E7EB;
      border-radius: 12px;
      overflow: hidden;
    }

    /* Header */
    .frigg-alerts-panel__header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid #E5E7EB;
    }

    .frigg-alerts-panel__title {
      font-size: 18px;
      font-weight: 600;
      color: #111827;
      margin: 0;
    }

    .frigg-alerts-panel__actions {
      display: flex;
      gap: 8px;
    }

    .frigg-alerts-panel__filter {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 12px;
      background: transparent;
      border: 1px solid #E5E7EB;
      border-radius: 6px;
      font-size: 14px;
      color: #6B7280;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .frigg-alerts-panel__filter:hover {
      background: #F9FAFB;
      border-color: #D1D5DB;
    }

    .frigg-alerts-panel__filter--active {
      background: #3B82F6;
      border-color: #3B82F6;
      color: white;
    }

    .frigg-alerts-panel__filter-count {
      padding: 2px 6px;
      background: rgba(0, 0, 0, 0.1);
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 500;
    }

    .frigg-alerts-panel__refresh {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      padding: 0;
      background: transparent;
      border: 1px solid #E5E7EB;
      border-radius: 6px;
      color: #6B7280;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .frigg-alerts-panel__refresh:hover {
      background: #F9FAFB;
      border-color: #D1D5DB;
    }

    .frigg-alerts-panel__refresh:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .frigg-alerts-panel__refresh svg {
      width: 20px;
      height: 20px;
    }

    /* Content */
    .frigg-alerts-panel__content {
      min-height: 200px;
      max-height: 600px;
      overflow-y: auto;
    }

    .frigg-alerts-panel__empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 20px;
      color: #9CA3AF;
    }

    .frigg-alerts-panel__empty svg {
      width: 48px;
      height: 48px;
      margin-bottom: 16px;
    }

    /* Alert list */
    .frigg-alerts-panel__list {
      padding: 0;
    }

    .frigg-alerts-panel__alert {
      display: flex;
      gap: 16px;
      padding: 16px 20px;
      border-bottom: 1px solid #E5E7EB;
      transition: background 0.2s ease;
    }

    .frigg-alerts-panel__alert:hover {
      background: #F9FAFB;
    }

    .frigg-alerts-panel__alert:last-child {
      border-bottom: none;
    }

    .frigg-alerts-panel__alert--acknowledged {
      opacity: 0.7;
    }

    .frigg-alerts-panel__alert-icon {
      flex-shrink: 0;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      background: #FEF3C7;
      color: #D97706;
    }

    .frigg-alerts-panel__alert--critical .frigg-alerts-panel__alert-icon {
      background: #FEE2E2;
      color: #DC2626;
    }

    .frigg-alerts-panel__alert--high .frigg-alerts-panel__alert-icon {
      background: #FFEDD5;
      color: #EA580C;
    }

    .frigg-alerts-panel__alert--medium .frigg-alerts-panel__alert-icon {
      background: #FEF3C7;
      color: #D97706;
    }

    .frigg-alerts-panel__alert--low .frigg-alerts-panel__alert-icon {
      background: #DBEAFE;
      color: #2563EB;
    }

    .frigg-alerts-panel__alert-icon svg {
      width: 20px;
      height: 20px;
    }

    .frigg-alerts-panel__alert-content {
      flex: 1;
      min-width: 0;
    }

    .frigg-alerts-panel__alert-title {
      font-size: 14px;
      font-weight: 600;
      color: #111827;
      margin: 0 0 4px 0;
    }

    .frigg-alerts-panel__alert-description {
      font-size: 14px;
      color: #6B7280;
      margin: 0 0 8px 0;
    }

    .frigg-alerts-panel__alert-meta {
      display: flex;
      gap: 16px;
      font-size: 12px;
      color: #9CA3AF;
    }

    .frigg-alerts-panel__alert-severity {
      text-transform: uppercase;
      font-weight: 500;
    }

    .frigg-alerts-panel__alert-actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .frigg-alerts-panel__alert-action {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      padding: 0;
      background: transparent;
      border: 1px solid #E5E7EB;
      border-radius: 6px;
      color: #6B7280;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .frigg-alerts-panel__alert-action:hover {
      background: white;
      border-color: #D1D5DB;
      color: #374151;
    }

    .frigg-alerts-panel__alert-action svg {
      width: 16px;
      height: 16px;
    }

    /* Footer */
    .frigg-alerts-panel__footer {
      padding: 16px 20px;
      border-top: 1px solid #E5E7EB;
      text-align: center;
    }

    .frigg-alerts-panel__load-more {
      padding: 8px 24px;
      background: white;
      border: 1px solid #E5E7EB;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      color: #374151;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .frigg-alerts-panel__load-more:hover {
      background: #F9FAFB;
      border-color: #D1D5DB;
    }

    .frigg-alerts-panel__load-more:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      .frigg-alerts-panel {
        background: #1F2937;
        border-color: #374151;
      }

      .frigg-alerts-panel__header {
        border-color: #374151;
      }

      .frigg-alerts-panel__title {
        color: white;
      }

      .frigg-alerts-panel__filter {
        border-color: #374151;
        color: #D1D5DB;
      }

      .frigg-alerts-panel__filter:hover {
        background: #374151;
        border-color: #4B5563;
      }

      .frigg-alerts-panel__refresh {
        border-color: #374151;
        color: #D1D5DB;
      }

      .frigg-alerts-panel__refresh:hover {
        background: #374151;
        border-color: #4B5563;
      }

      .frigg-alerts-panel__alert {
        border-color: #374151;
      }

      .frigg-alerts-panel__alert:hover {
        background: #374151;
      }

      .frigg-alerts-panel__alert-title {
        color: white;
      }

      .frigg-alerts-panel__alert-description {
        color: #D1D5DB;
      }

      .frigg-alerts-panel__alert-action {
        border-color: #374151;
        color: #D1D5DB;
      }

      .frigg-alerts-panel__alert-action:hover {
        background: #4B5563;
        border-color: #6B7280;
        color: white;
      }

      .frigg-alerts-panel__footer {
        border-color: #374151;
      }

      .frigg-alerts-panel__load-more {
        background: #374151;
        border-color: #4B5563;
        color: white;
      }

      .frigg-alerts-panel__load-more:hover {
        background: #4B5563;
        border-color: #6B7280;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FriggAlertsPanelComponent implements OnInit, OnDestroy {
  @Input() integrationId!: string;
  @Input() limit: number = 20;
  @Input() autoRefresh: boolean = true;
  @Input() refreshInterval: number = 30000;
  @Input() showLoadMore: boolean = true;
  @Input() currentUserId: string = 'system';

  alerts: Alert[] = [];
  filteredAlerts: Alert[] = [];
  loading: boolean = false;
  hasMore: boolean = false;
  activeFilter: string = 'All';
  filters: string[] = ['All', 'Active', 'Critical', 'Acknowledged'];
  
  private destroy$ = new Subject<void>();
  private offset: number = 0;

  constructor(
    private alertsService: AlertsService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Subscribe to alerts
    this.alertsService.alerts$
      .pipe(takeUntil(this.destroy$))
      .subscribe(alerts => {
        this.alerts = alerts;
        this.applyFilter();
        this.cdr.markForCheck();
      });

    // Subscribe to loading state
    this.alertsService.loading$
      .pipe(takeUntil(this.destroy$))
      .subscribe(loading => {
        this.loading = loading;
        this.cdr.markForCheck();
      });

    // Initial load
    this.loadAlerts();

    // Set up auto-refresh if enabled
    if (this.autoRefresh) {
      this.alertsService.setupAutoRefresh(this.integrationId, this.refreshInterval)
        .pipe(takeUntil(this.destroy$))
        .subscribe();
    }

    // Subscribe to real-time alerts
    this.alertsService.subscribeToAlerts(this.integrationId)
      .pipe(takeUntil(this.destroy$))
      .subscribe();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadAlerts(): void {
    this.alertsService.fetchAlerts(this.integrationId, {
      limit: this.limit,
      offset: this.offset
    }).subscribe(alerts => {
      this.hasMore = alerts.length === this.limit;
    });
  }

  loadMore(): void {
    this.offset += this.limit;
    this.loadAlerts();
  }

  refresh(): void {
    this.offset = 0;
    this.alertsService.refresh();
  }

  setFilter(filter: string): void {
    this.activeFilter = filter;
    this.applyFilter();
  }

  applyFilter(): void {
    switch (this.activeFilter) {
      case 'Active':
        this.filteredAlerts = this.alerts.filter(a => a.status === 'active');
        break;
      case 'Critical':
        this.filteredAlerts = this.alerts.filter(a => a.severity === 'critical');
        break;
      case 'Acknowledged':
        this.filteredAlerts = this.alerts.filter(a => a.status === 'acknowledged');
        break;
      default:
        this.filteredAlerts = this.alerts;
    }
  }

  getFilterCount(filter: string): number {
    switch (filter) {
      case 'Active':
        return this.alerts.filter(a => a.status === 'active').length;
      case 'Critical':
        return this.alerts.filter(a => a.severity === 'critical').length;
      case 'Acknowledged':
        return this.alerts.filter(a => a.status === 'acknowledged').length;
      default:
        return this.alerts.length;
    }
  }

  acknowledgeAlert(alert: Alert): void {
    this.alertsService.acknowledgeAlert(alert.id, this.currentUserId).subscribe();
  }

  resolveAlert(alert: Alert): void {
    const resolution = prompt('Enter resolution details:');
    if (resolution) {
      this.alertsService.resolveAlert(alert.id, this.currentUserId, resolution).subscribe();
    }
  }

  trackByAlertId(index: number, alert: Alert): string {
    return alert.id;
  }

  getRelativeTime(timestamp: string): string {
    const now = new Date();
    const alertTime = new Date(timestamp);
    const diff = now.getTime() - alertTime.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  }
}