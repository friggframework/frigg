/**
 * Angular CloudWatch Service
 * Wraps ui-core CloudWatchService with RxJS observables for monitoring metrics
 */

import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable, Subject, interval, merge, combineLatest } from 'rxjs';
import { 
  map, 
  distinctUntilChanged, 
  switchMap, 
  shareReplay,
  startWith,
  tap,
  catchError
} from 'rxjs/operators';
import { CloudWatchService as CoreCloudWatchService } from '@friggframework/ui-core/services';
import { ApiService } from './api.service';

export interface MetricDataPoint {
  timestamp: string;
  value: number;
}

export interface MetricsData {
  requestCount: MetricDataPoint[];
  latency: MetricDataPoint[];
  errorCount: MetricDataPoint[];
  healthChecks: MetricDataPoint[];
  cpuUtilization: MetricDataPoint[];
  memoryUtilization: MetricDataPoint[];
  activeConnections: MetricDataPoint[];
  throughput: MetricDataPoint[];
  diskIO: MetricDataPoint[];
  networkIO: MetricDataPoint[];
}

export interface CloudWatchAlert {
  id: string;
  integrationId: string;
  metric: string;
  threshold: number;
  condition: 'above' | 'below';
  status: 'active' | 'resolved';
  triggeredAt: string;
  resolvedAt?: string;
}

export interface CloudWatchLog {
  timestamp: string;
  level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
  message: string;
  metadata?: any;
}

export interface MetricsState {
  metrics: MetricsData | null;
  alerts: CloudWatchAlert[];
  logs: CloudWatchLog[];
  loading: boolean;
  error: Error | null;
  lastFetch: Date | null;
}

export interface MetricsQuery {
  integrationId: string;
  startTime: Date;
  endTime: Date;
  config?: any;
}

export interface MetricsSummary {
  avgLatency: number;
  totalRequests: number;
  errorRate: number;
  uptime: number;
  currentCPU: number;
  currentMemory: number;
  activeConnections: number;
  throughput: number;
}

@Injectable({
  providedIn: 'root'
})
export class CloudWatchService {
  private coreCloudWatchService: CoreCloudWatchService;
  private stateSubject: BehaviorSubject<MetricsState>;
  private refreshSubject: Subject<void>;
  private metricsQuerySubject: BehaviorSubject<MetricsQuery | null>;

  // Observable streams
  public state$: Observable<MetricsState>;
  public metrics$: Observable<MetricsData | null>;
  public alerts$: Observable<CloudWatchAlert[]>;
  public logs$: Observable<CloudWatchLog[]>;
  public loading$: Observable<boolean>;
  public error$: Observable<Error | null>;

  // Computed metrics
  public summary$: Observable<MetricsSummary>;
  public latencyTrend$: Observable<number>;
  public errorTrend$: Observable<number>;
  public healthStatus$: Observable<'healthy' | 'degraded' | 'critical'>;

  constructor(
    private ngZone: NgZone,
    private apiService: ApiService
  ) {
    // Initialize core service
    this.coreCloudWatchService = new CoreCloudWatchService(this.apiService);
    
    // Initialize state
    const initialState: MetricsState = {
      metrics: null,
      alerts: [],
      logs: [],
      loading: false,
      error: null,
      lastFetch: null
    };

    // Initialize subjects
    this.stateSubject = new BehaviorSubject<MetricsState>(initialState);
    this.refreshSubject = new Subject<void>();
    this.metricsQuerySubject = new BehaviorSubject<MetricsQuery | null>(null);

    // Set up observables
    this.state$ = this.stateSubject.asObservable();
    this.metrics$ = this.state$.pipe(
      map(state => state.metrics),
      distinctUntilChanged()
    );
    this.alerts$ = this.state$.pipe(
      map(state => state.alerts),
      distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b))
    );
    this.logs$ = this.state$.pipe(
      map(state => state.logs),
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

    // Set up computed observables
    this.setupComputedObservables();
  }

  private setupComputedObservables(): void {
    // Metrics summary
    this.summary$ = this.metrics$.pipe(
      map(metrics => {
        if (!metrics) {
          return {
            avgLatency: 0,
            totalRequests: 0,
            errorRate: 0,
            uptime: 100,
            currentCPU: 0,
            currentMemory: 0,
            activeConnections: 0,
            throughput: 0
          };
        }

        return {
          avgLatency: this.coreCloudWatchService.calculateAverage(metrics.latency),
          totalRequests: metrics.requestCount.reduce((sum, point) => sum + point.value, 0),
          errorRate: this.coreCloudWatchService.calculateErrorRate(
            metrics.errorCount,
            metrics.requestCount
          ),
          uptime: this.coreCloudWatchService.calculateUptime(metrics.healthChecks),
          currentCPU: this.coreCloudWatchService.getLatestValue(metrics.cpuUtilization),
          currentMemory: this.coreCloudWatchService.getLatestValue(metrics.memoryUtilization),
          activeConnections: this.coreCloudWatchService.getLatestValue(metrics.activeConnections),
          throughput: this.coreCloudWatchService.getLatestValue(metrics.throughput)
        };
      }),
      shareReplay(1)
    );

    // Latency trend
    this.latencyTrend$ = this.metrics$.pipe(
      map(metrics => metrics ? this.coreCloudWatchService.calculateTrend(metrics.latency) : 0),
      shareReplay(1)
    );

    // Error trend
    this.errorTrend$ = this.metrics$.pipe(
      map(metrics => metrics ? this.coreCloudWatchService.calculateTrend(metrics.errorCount) : 0),
      shareReplay(1)
    );

    // Health status
    this.healthStatus$ = combineLatest([
      this.summary$,
      this.alerts$
    ]).pipe(
      map(([summary, alerts]) => {
        const activeAlerts = alerts.filter(a => a.status === 'active');
        
        if (activeAlerts.length > 5 || summary.errorRate > 10 || summary.uptime < 90) {
          return 'critical';
        } else if (activeAlerts.length > 0 || summary.errorRate > 5 || summary.uptime < 95) {
          return 'degraded';
        }
        return 'healthy';
      }),
      shareReplay(1)
    );
  }

  /**
   * Fetch metrics for an integration
   */
  fetchMetrics(query: MetricsQuery): Observable<MetricsData> {
    this.updateState({ loading: true, error: null });
    this.metricsQuerySubject.next(query);

    return new Observable<MetricsData>(observer => {
      this.coreCloudWatchService.getMetrics(query)
        .then(metrics => {
          this.ngZone.run(() => {
            this.updateState({
              metrics: metrics as MetricsData,
              loading: false,
              lastFetch: new Date()
            });
            observer.next(metrics as MetricsData);
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
   * Set up auto-refresh for metrics
   */
  setupAutoRefresh(intervalMs: number = 60000): Observable<MetricsData> {
    return combineLatest([
      merge(
        this.refreshSubject,
        interval(intervalMs)
      ).pipe(startWith(0)),
      this.metricsQuerySubject
    ]).pipe(
      switchMap(([_, query]) => {
        if (!query) {
          return [];
        }
        return this.fetchMetrics(query);
      })
    );
  }

  /**
   * Manually refresh metrics
   */
  refresh(): void {
    this.refreshSubject.next();
  }

  /**
   * Fetch alerts for an integration
   */
  fetchAlerts(integrationId: string): Observable<CloudWatchAlert[]> {
    return new Observable<CloudWatchAlert[]>(observer => {
      this.coreCloudWatchService.getAlerts(integrationId)
        .then(alerts => {
          this.ngZone.run(() => {
            this.updateState({ alerts: alerts as CloudWatchAlert[] });
            observer.next(alerts as CloudWatchAlert[]);
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
   * Fetch logs for an integration
   */
  fetchLogs(
    integrationId: string, 
    startTime: Date, 
    endTime: Date, 
    logLevel: string = 'INFO'
  ): Observable<CloudWatchLog[]> {
    return new Observable<CloudWatchLog[]>(observer => {
      this.coreCloudWatchService.getLogs({
        integrationId,
        startTime,
        endTime,
        logLevel
      })
        .then(logs => {
          this.ngZone.run(() => {
            this.updateState({ logs: logs as CloudWatchLog[] });
            observer.next(logs as CloudWatchLog[]);
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
   * Fetch custom metrics
   */
  fetchCustomMetrics(
    integrationId: string, 
    metricNames: string | string[]
  ): Observable<Record<string, MetricDataPoint[]>> {
    return new Observable(observer => {
      this.coreCloudWatchService.getCustomMetrics(integrationId, metricNames)
        .then(metrics => {
          this.ngZone.run(() => {
            observer.next(metrics);
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
   * Get time series data for a specific metric
   */
  getMetricTimeSeries(metricName: keyof MetricsData): Observable<MetricDataPoint[]> {
    return this.metrics$.pipe(
      map(metrics => {
        if (!metrics || !metrics[metricName]) {
          return [];
        }
        return this.coreCloudWatchService.formatTimeSeries(metrics[metricName]);
      })
    );
  }

  /**
   * Calculate metric statistics
   */
  getMetricStats(metricName: keyof MetricsData): Observable<{
    min: number;
    max: number;
    avg: number;
    current: number;
  }> {
    return this.getMetricTimeSeries(metricName).pipe(
      map(dataPoints => {
        if (dataPoints.length === 0) {
          return { min: 0, max: 0, avg: 0, current: 0 };
        }

        const values = dataPoints.map(p => p.value);
        return {
          min: Math.min(...values),
          max: Math.max(...values),
          avg: this.coreCloudWatchService.calculateAverage(dataPoints),
          current: this.coreCloudWatchService.getLatestValue(dataPoints)
        };
      })
    );
  }

  /**
   * Set alert threshold for a metric
   */
  setAlertThreshold(
    metric: string, 
    threshold: number, 
    condition: 'above' | 'below'
  ): void {
    // This would typically call a backend API to set up CloudWatch alarms
    console.log(`Setting alert: ${metric} ${condition} ${threshold}`);
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.updateState({
      metrics: null,
      alerts: [],
      logs: [],
      error: null,
      lastFetch: null
    });
    this.metricsQuerySubject.next(null);
  }

  /**
   * Update state
   */
  private updateState(updates: Partial<MetricsState>): void {
    const currentState = this.stateSubject.value;
    this.stateSubject.next({ ...currentState, ...updates });
  }

  /**
   * Clean up
   */
  ngOnDestroy(): void {
    this.refreshSubject.complete();
    this.stateSubject.complete();
    this.metricsQuerySubject.complete();
  }
}