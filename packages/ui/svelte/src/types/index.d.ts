/// <reference types="svelte" />
import type { SvelteComponent } from 'svelte';
import type { Readable, Writable, Derived } from 'svelte/store';
import type { 
  FrameworkPlugin, 
  FrameworkAdapter,
  ToastManager,
  ApiClient,
  AlertsService,
  CloudWatchService,
  FriggUICore
} from '@friggframework/ui-core';

// Plugin types
export interface SvelteAdapter extends FrameworkAdapter {
  createState<T>(initialState: T): Writable<T>;
  createComputed<T>(getter: () => T, dependencies?: any[]): Readable<T>;
  setContext(key: any, value: any): void;
  getContext(key: any): any;
  onMount(callback: () => void): void;
  onDestroy(callback: () => void): void;
  getStoreValue<T>(store: Readable<T>): T;
  createCustomStore<T>(initialValue: T, start?: (set: (value: T) => void) => (() => void) | void): Readable<T>;
}

export interface SveltePlugin extends FrameworkPlugin {
  adapter: SvelteAdapter;
  getSvelteAdapter(): SvelteAdapter;
  createStoreFromService<T>(service: any, transformFn?: (state: any) => T): Readable<T> & { unsubscribe: () => void };
  provideCore(core: FriggUICore): void;
  getCore(): FriggUICore;
  contextKey: symbol;
}

// Store types
export interface ToastStore extends Readable<Toast[]> {
  toast(props: ToastProps): string;
  success(message: string, options?: Partial<ToastProps>): string;
  error(message: string, options?: Partial<ToastProps>): string;
  warning(message: string, options?: Partial<ToastProps>): string;
  info(message: string, options?: Partial<ToastProps>): string;
  dismiss(toastId: string): void;
  dismissAll(): void;
  clear(): void;
  destroy(): void;
}

export interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: 'default' | 'success' | 'destructive' | 'warning';
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export interface ToastProps extends Omit<Toast, 'id'> {}

export interface ApiStore extends Readable<Map<string, ApiRequest>> {
  loading: Readable<boolean>;
  errors: Readable<Error[]>;
  api: {
    get<T = any>(url: string, config?: any): Promise<T>;
    post<T = any>(url: string, data?: any, config?: any): Promise<T>;
    put<T = any>(url: string, data?: any, config?: any): Promise<T>;
    patch<T = any>(url: string, data?: any, config?: any): Promise<T>;
    delete<T = any>(url: string, config?: any): Promise<T>;
    client: ApiClient;
    setBaseUrl(url: string): void;
    setHeaders(headers: Record<string, string>): void;
    setAuthToken(token: string): void;
    clearAuthToken(): void;
    addRequestInterceptor(interceptor: (config: any) => any): string;
    addResponseInterceptor(interceptor: (response: any) => any): string;
    removeRequestInterceptor(id: string): void;
    removeResponseInterceptor(id: string): void;
  };
  clearRequests(): void;
  isLoading(method: string, url: string): boolean;
  getError(method: string, url: string): Error | null;
}

export interface ApiRequest {
  method: string;
  url: string;
  loading: boolean;
  error: Error | null;
  data: any;
}

export interface Alert {
  id: string;
  title: string;
  message: string;
  severity: 'critical' | 'warning' | 'info';
  timestamp: string;
  dismissed: boolean;
  read: boolean;
  metadata?: Record<string, any>;
}

export interface AlertsStore extends Readable<Alert[]> {
  addAlert(alert: Partial<Alert>): Promise<Alert>;
  updateAlert(alertId: string, updates: Partial<Alert>): Promise<Alert>;
  removeAlert(alertId: string): Promise<void>;
  dismissAlert(alertId: string): Promise<Alert>;
  clearAlerts(): Promise<void>;
  refresh(): Promise<void>;
  destroy(): void;
}

export interface CloudWatchMetrics {
  lambda: any[];
  apiGateway: any[];
  sqs: any[];
  custom: any[];
}

export interface CloudWatchStore {
  metrics: Readable<CloudWatchMetrics>;
  realtimeMetrics: Readable<{
    enabled: boolean;
    interval: number | null;
    lastUpdate: Date | null;
  }>;
  config: Readable<{
    region: string;
    refreshInterval: number;
    timeRange: {
      start: Date;
      end: Date;
    };
  }>;
  fetchLambdaMetrics(functionName: string, options?: any): Promise<any[]>;
  fetchApiGatewayMetrics(apiName: string, options?: any): Promise<any[]>;
  fetchSqsMetrics(queueName: string, options?: any): Promise<any[]>;
  fetchCustomMetrics(namespace: string, metricName: string, options?: any): Promise<any[]>;
  sendMetric(namespace: string, metricData: any): Promise<void>;
  startRealtime(resources?: {
    lambdaFunctions?: string[];
    apiGateways?: string[];
    sqsQueues?: string[];
  }): void;
  stopRealtime(): void;
  updateConfig(updates: any): void;
  destroy(): void;
}

export interface CoreStore extends Readable<{
  initialized: boolean;
  core: FriggUICore | null;
  config: any;
  error: Error | null;
}> {
  initialize(config?: any): Promise<FriggUICore>;
  getCore(): FriggUICore;
  updateConfig(updates: any): Promise<void>;
  reset(): void;
}

// Component prop types
export interface ToastNotificationProps {
  position?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
  maxToasts?: number;
}

export interface LoadingSpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  color?: 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'white' | 'current';
  overlay?: boolean;
  message?: string;
  className?: string;
}

export interface ModalProps {
  open: boolean;
  title?: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  closeOnEscape?: boolean;
  closeOnOutsideClick?: boolean;
  showCloseButton?: boolean;
  className?: string;
}

export interface ErrorBoundaryProps {
  fallback?: typeof SvelteComponent;
  onError?: (error: Error, errorInfo: any) => void;
  resetKeys?: any[];
  resetOnPropsChange?: boolean;
  isolate?: boolean;
}

export interface IntegrationCardProps {
  integration: Integration;
  variant?: 'default' | 'compact' | 'detailed';
  showActions?: boolean;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}

export interface Integration {
  id?: string;
  name: string;
  description?: string;
  category?: string;
  icon?: string;
  logo?: string;
  status?: 'connected' | 'disconnected';
  isConnected?: boolean;
  lastSync?: string;
  dataPoints?: number;
}

export interface IntegrationListProps {
  integrations: Integration[];
  loading?: boolean;
  error?: Error | null;
  variant?: 'grid' | 'list' | 'compact';
  columns?: 1 | 2 | 3 | 4;
  showFilters?: boolean;
  showSearch?: boolean;
  emptyMessage?: string;
  className?: string;
}

export interface AlertsPanelProps {
  maxHeight?: string;
  showHeader?: boolean;
  showFilters?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number;
  className?: string;
}

// Action types
export interface ClickOutsideOptions {
  enabled?: boolean;
  callback?: (event: MouseEvent) => void;
}

export interface PortalOptions {
  target?: string | HTMLElement;
}

export interface TooltipOptions {
  content?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  offset?: number;
  className?: string;
}

// Export stores
export declare const toastStore: ToastStore;
export declare const toastCount: Readable<number>;
export declare const activeToasts: Readable<Toast[]>;

export declare const apiStore: ApiStore;
export declare const api: ApiStore['api'];
export declare const apiLoading: Readable<boolean>;
export declare const apiErrors: Readable<Error[]>;

export declare const alertsStore: AlertsStore;
export declare const criticalAlerts: Readable<Alert[]>;
export declare const warningAlerts: Readable<Alert[]>;
export declare const infoAlerts: Readable<Alert[]>;
export declare const unreadAlerts: Readable<Alert[]>;
export declare const alertCounts: Readable<{
  total: number;
  critical: number;
  warning: number;
  info: number;
  unread: number;
}>;

export declare const cloudWatchStore: CloudWatchStore;
export declare const allMetrics: Readable<CloudWatchMetrics & { all: any[] }>;
export declare const metricStats: Readable<any>;
export declare const healthStatus: Readable<any>;

export declare const coreStore: CoreStore;

// Export functions
export declare function initializeCore(config?: any): Promise<FriggUICore>;
export declare function getCore(): FriggUICore;
export declare function createAlert(options: Partial<Alert>): Alert;
export declare function initializeSvelteFrigg(config?: any): Promise<FriggUICore>;
export declare function getSvelteCore(): FriggUICore;

// Export plugin
export declare const sveltePlugin: SveltePlugin;
export declare function installSveltePlugin(core: FriggUICore): SveltePlugin;

// Export actions
export declare function clickOutside(node: HTMLElement, options?: ClickOutsideOptions): any;
export declare function portal(node: HTMLElement, target?: string | HTMLElement): any;
export declare function tooltip(node: HTMLElement, options?: TooltipOptions): any;

// Export components
export { default as ToastNotification } from '../components/ToastNotification.svelte';
export { default as IntegrationList } from '../components/IntegrationList.svelte';
export { default as IntegrationCard } from '../components/IntegrationCard.svelte';
export { default as AlertsPanel } from '../components/AlertsPanel.svelte';
export { default as LoadingSpinner } from '../components/LoadingSpinner.svelte';
export { default as ErrorBoundary } from '../components/ErrorBoundary.svelte';
export { default as Modal } from '../components/Modal.svelte';