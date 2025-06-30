/**
 * Angular Alerts Service
 * Wraps ui-core AlertsService with RxJS observables for real-time alert management
 */

import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable, Subject, interval, merge } from 'rxjs';
import { 
  map, 
  distinctUntilChanged, 
  switchMap, 
  shareReplay,
  startWith,
  filter,
  tap
} from 'rxjs/operators';
import { AlertsService as CoreAlertsService } from '@friggframework/ui-core/services';
import { ApiService } from './api.service';

export interface Alert {
  id: string;
  integrationId: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  status: 'active' | 'acknowledged' | 'resolved' | 'suppressed';
  title: string;
  description: string;
  timestamp: string;
  metadata?: any;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  resolution?: string;
}

export interface AlertsState {
  alerts: Alert[];
  loading: boolean;
  error: Error | null;
  lastFetch: Date | null;
}

export interface AlertFilters {
  severity?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

@Injectable({
  providedIn: 'root'
})
export class AlertsService {
  private coreAlertsService: CoreAlertsService;
  private stateSubject: BehaviorSubject<AlertsState>;
  private alertAddedSubject: Subject<Alert>;
  private alertUpdatedSubject: Subject<Alert>;
  private alertRemovedSubject: Subject<string>;
  private refreshSubject: Subject<void>;
  private subscriptions: Map<string, () => void>;

  // Observable streams
  public state$: Observable<AlertsState>;
  public alerts$: Observable<Alert[]>;
  public loading$: Observable<boolean>;
  public error$: Observable<Error | null>;
  public alertAdded$: Observable<Alert>;
  public alertUpdated$: Observable<Alert>;
  public alertRemoved$: Observable<string>;

  // Computed observables
  public activeAlerts$: Observable<Alert[]>;
  public criticalAlerts$: Observable<Alert[]>;
  public alertCounts$: Observable<{
    total: number;
    active: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  }>;

  // Static constants
  static readonly SEVERITY = CoreAlertsService.SEVERITY;
  static readonly STATUS = CoreAlertsService.STATUS;

  constructor(
    private ngZone: NgZone,
    private apiService: ApiService
  ) {
    // Initialize core service
    this.coreAlertsService = new CoreAlertsService(this.apiService);
    
    // Initialize state
    const initialState: AlertsState = {
      alerts: [],
      loading: false,
      error: null,
      lastFetch: null
    };

    // Initialize subjects
    this.stateSubject = new BehaviorSubject<AlertsState>(initialState);
    this.alertAddedSubject = new Subject<Alert>();
    this.alertUpdatedSubject = new Subject<Alert>();
    this.alertRemovedSubject = new Subject<string>();
    this.refreshSubject = new Subject<void>();
    this.subscriptions = new Map();

    // Set up observables
    this.state$ = this.stateSubject.asObservable();
    this.alerts$ = this.state$.pipe(
      map(state => state.alerts),
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b))
    );
    this.loading$ = this.state$.pipe(
      map(state => state.loading),
      distinctUntilChanged()
    );
    this.error$ = this.state$.pipe(
      map(state => state.error),
      distinctUntilChanged()
    );
    
    this.alertAdded$ = this.alertAddedSubject.asObservable();
    this.alertUpdated$ = this.alertUpdatedSubject.asObservable();
    this.alertRemoved$ = this.alertRemovedSubject.asObservable();

    // Computed observables
    this.activeAlerts$ = this.alerts$.pipe(
      map(alerts => alerts.filter(a => a.status === 'active')),
      shareReplay(1)
    );

    this.criticalAlerts$ = this.alerts$.pipe(
      map(alerts => alerts.filter(a => 
        a.severity === 'critical' && a.status === 'active'
      )),
      shareReplay(1)
    );

    this.alertCounts$ = this.alerts$.pipe(
      map(alerts => ({
        total: alerts.length,
        active: alerts.filter(a => a.status === 'active').length,
        critical: alerts.filter(a => a.severity === 'critical' && a.status === 'active').length,
        high: alerts.filter(a => a.severity === 'high' && a.status === 'active').length,
        medium: alerts.filter(a => a.severity === 'medium' && a.status === 'active').length,
        low: alerts.filter(a => a.severity === 'low' && a.status === 'active').length
      })),
      shareReplay(1)
    );
  }

  /**
   * Fetch alerts for an integration
   */
  fetchAlerts(integrationId: string, filters?: AlertFilters): Observable<Alert[]> {
    this.updateState({ loading: true, error: null });

    return new Observable<Alert[]>(observer => {
      this.coreAlertsService.getAlerts(integrationId, filters)
        .then(alerts => {
          this.ngZone.run(() => {
            this.updateState({
              alerts: alerts as Alert[],
              loading: false,
              lastFetch: new Date()
            });
            observer.next(alerts as Alert[]);
            observer.complete();
          });
        })
        .catch(error => {
          this.ngZone.run(() => {
            this.updateState({
              loading: false,
              error
            });
            observer.error(error);
          });
        });
    });
  }

  /**
   * Set up auto-refresh for alerts
   */
  setupAutoRefresh(integrationId: string, intervalMs: number = 30000): Observable<Alert[]> {
    return merge(
      this.refreshSubject,
      interval(intervalMs)
    ).pipe(
      startWith(0),
      switchMap(() => this.fetchAlerts(integrationId))
    );
  }

  /**
   * Manually refresh alerts
   */
  refresh(): void {
    this.refreshSubject.next();
  }

  /**
   * Subscribe to real-time alerts for an integration
   */
  subscribeToAlerts(integrationId: string): Observable<Alert> {
    return new Observable<Alert>(observer => {
      const unsubscribe = this.coreAlertsService.subscribe(integrationId, (alert: Alert) => {
        this.ngZone.run(() => {
          // Update local state
          const currentState = this.stateSubject.value;
          const existingIndex = currentState.alerts.findIndex(a => a.id === alert.id);
          
          if (existingIndex >= 0) {
            // Update existing alert
            const updatedAlerts = [...currentState.alerts];
            updatedAlerts[existingIndex] = alert;
            this.updateState({ alerts: updatedAlerts });
            this.alertUpdatedSubject.next(alert);
          } else {
            // Add new alert
            this.updateState({ alerts: [alert, ...currentState.alerts] });
            this.alertAddedSubject.next(alert);
          }
          
          observer.next(alert);
        });
      });

      // Store subscription for cleanup
      this.subscriptions.set(integrationId, unsubscribe);

      // Return cleanup function
      return () => {
        unsubscribe();
        this.subscriptions.delete(integrationId);
      };
    });
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string, userId: string): Observable<Alert> {
    return new Observable<Alert>(observer => {
      this.coreAlertsService.acknowledgeAlert(alertId, userId)
        .then(alert => {
          this.ngZone.run(() => {
            this.updateAlertInState(alert);
            this.alertUpdatedSubject.next(alert);
            observer.next(alert);
            observer.complete();
          });
        })
        .catch(error => {
          this.ngZone.run(() => {
            observer.error(error);
          });
        });
    });
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string, userId: string, resolution: string): Observable<Alert> {
    return new Observable<Alert>(observer => {
      this.coreAlertsService.resolveAlert(alertId, userId, resolution)
        .then(alert => {
          this.ngZone.run(() => {
            this.updateAlertInState(alert);
            this.alertUpdatedSubject.next(alert);
            observer.next(alert);
            observer.complete();
          });
        })
        .catch(error => {
          this.ngZone.run(() => {
            observer.error(error);
          });
        });
    });
  }

  /**
   * Create a new alert
   */
  createAlert(alertData: Omit<Alert, 'id'>): Observable<Alert> {
    return new Observable<Alert>(observer => {
      this.coreAlertsService.createAlert(alertData)
        .then(alert => {
          this.ngZone.run(() => {
            const currentState = this.stateSubject.value;
            this.updateState({ alerts: [alert, ...currentState.alerts] });
            this.alertAddedSubject.next(alert);
            observer.next(alert);
            observer.complete();
          });
        })
        .catch(error => {
          this.ngZone.run(() => {
            observer.error(error);
          });
        });
    });
  }

  /**
   * Update an alert
   */
  updateAlert(alertId: string, updates: Partial<Alert>): Observable<Alert> {
    return new Observable<Alert>(observer => {
      this.coreAlertsService.updateAlert(alertId, updates)
        .then(alert => {
          this.ngZone.run(() => {
            this.updateAlertInState(alert);
            this.alertUpdatedSubject.next(alert);
            observer.next(alert);
            observer.complete();
          });
        })
        .catch(error => {
          this.ngZone.run(() => {
            observer.error(error);
          });
        });
    });
  }

  /**
   * Delete an alert
   */
  deleteAlert(alertId: string): Observable<void> {
    return new Observable<void>(observer => {
      this.coreAlertsService.deleteAlert(alertId)
        .then(() => {
          this.ngZone.run(() => {
            const currentState = this.stateSubject.value;
            this.updateState({
              alerts: currentState.alerts.filter(a => a.id !== alertId)
            });
            this.alertRemovedSubject.next(alertId);
            observer.next();
            observer.complete();
          });
        })
        .catch(error => {
          this.ngZone.run(() => {
            observer.error(error);
          });
        });
    });
  }

  /**
   * Filter alerts by severity
   */
  filterBySeverity(severity: string): Observable<Alert[]> {
    return this.alerts$.pipe(
      map(alerts => this.coreAlertsService.filterAlertsBySeverity(alerts, severity))
    );
  }

  /**
   * Filter alerts by status
   */
  filterByStatus(status: string): Observable<Alert[]> {
    return this.alerts$.pipe(
      map(alerts => this.coreAlertsService.filterAlertsByStatus(alerts, status))
    );
  }

  /**
   * Get alerts grouped by severity
   */
  getAlertsGroupedBySeverity(): Observable<Record<string, Alert[]>> {
    return this.alerts$.pipe(
      map(alerts => this.coreAlertsService.groupAlertsBySeverity(alerts))
    );
  }

  /**
   * Sort alerts by timestamp
   */
  sortAlertsByTimestamp(order: 'asc' | 'desc' = 'desc'): Observable<Alert[]> {
    return this.alerts$.pipe(
      map(alerts => this.coreAlertsService.sortAlertsByTimestamp(alerts, order))
    );
  }

  /**
   * Update state
   */
  private updateState(updates: Partial<AlertsState>): void {
    const currentState = this.stateSubject.value;
    this.stateSubject.next({ ...currentState, ...updates });
  }

  /**
   * Update a single alert in state
   */
  private updateAlertInState(alert: Alert): void {
    const currentState = this.stateSubject.value;
    const alerts = currentState.alerts.map(a => 
      a.id === alert.id ? alert : a
    );
    this.updateState({ alerts });
  }

  /**
   * Clean up subscriptions
   */
  ngOnDestroy(): void {
    // Unsubscribe from all real-time subscriptions
    this.subscriptions.forEach(unsubscribe => unsubscribe());
    this.subscriptions.clear();

    // Complete subjects
    this.alertAddedSubject.complete();
    this.alertUpdatedSubject.complete();
    this.alertRemovedSubject.complete();
    this.refreshSubject.complete();
    this.stateSubject.complete();
  }
}