/**
 * TypeScript definitions for @friggframework/ui-vue
 */

import { Component, ComputedRef, Ref, Plugin, App } from 'vue';
import { 
  FriggUICore, 
  ToastManager, 
  ApiService, 
  CloudWatchService, 
  AlertsService,
  Alert,
  Integration,
  ToastOptions,
  ToastType,
  ApiRequestConfig
} from '@friggframework/ui-core';

// Component Exports
export declare const IntegrationList: Component;
export declare const AlertsPanel: Component;
export declare const ToastDemo: Component;
export declare const IntegrationCard: Component;
export declare const LoadingSpinner: Component;
export declare const ErrorBoundary: Component;
export declare const Modal: Component;

// Plugin Types
export interface VuePluginOptions {
  core?: FriggUICore;
  config?: any;
}

export declare const install: (app: App, options?: VuePluginOptions) => App;

// Composable Types
export interface UseFriggCoreReturn {
  core: Ref<FriggUICore | null>;
  isInitialized: Ref<boolean>;
  error: Ref<Error | null>;
  hasError: ComputedRef<boolean>;
  initialize: (config?: any) => void;
  updateConfig: (config: any) => void;
  getToastManager: () => ToastManager | undefined;
  getApiService: () => ApiService | undefined;
  getCloudWatchService: () => CloudWatchService | undefined;
  getAlertsService: () => AlertsService | undefined;
  registerPlugin: (plugin: any) => void;
  activateFramework: (frameworkName: string) => void;
  getComponent: (name: string) => any;
  getAdapter: (name: string) => any;
  callHook: (name: string, ...args: any[]) => any;
}

export declare function useFriggCore(config?: any): UseFriggCoreReturn;

export interface UseToastReturn {
  toasts: Ref<any[]>;
  activeToasts: ComputedRef<any[]>;
  hasActiveToasts: ComputedRef<boolean>;
  showToast: (message: string, options?: ToastOptions) => void;
  success: (message: string, options?: ToastOptions) => void;
  error: (message: string, options?: ToastOptions) => void;
  warning: (message: string, options?: ToastOptions) => void;
  info: (message: string, options?: ToastOptions) => void;
  promise: (promise: Promise<any>, messages: { loading: string; success: string; error: string }, options?: ToastOptions) => void;
  custom: (content: any, options?: ToastOptions) => void;
  dismiss: (id: string) => void;
  clearAll: () => void;
  updateToasts: () => void;
  setDefaultOptions: (options: ToastOptions) => void;
}

export declare function useToast(): UseToastReturn;

export interface UseApiClientReturn {
  loading: Ref<boolean>;
  error: Ref<Error | null>;
  data: Ref<any>;
  request: (config: ApiRequestConfig) => Promise<any>;
  get: (url: string, config?: ApiRequestConfig) => Promise<any>;
  post: (url: string, data?: any, config?: ApiRequestConfig) => Promise<any>;
  put: (url: string, data?: any, config?: ApiRequestConfig) => Promise<any>;
  patch: (url: string, data?: any, config?: ApiRequestConfig) => Promise<any>;
  deleteRequest: (url: string, config?: ApiRequestConfig) => Promise<any>;
  setAuthToken: (token: string) => void;
  clearAuthToken: () => void;
  setDefaultHeaders: (headers: Record<string, string>) => void;
  interceptRequest: (interceptor: (config: ApiRequestConfig) => ApiRequestConfig) => void;
  interceptResponse: (interceptor: (response: any) => any) => void;
}

export declare function useApiClient(): UseApiClientReturn;

export interface UseAlertsReturn {
  alerts: Ref<Alert[]>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
  hasError: ComputedRef<boolean>;
  activeAlerts: ComputedRef<Alert[]>;
  criticalAlerts: ComputedRef<Alert[]>;
  highPriorityAlerts: ComputedRef<Alert[]>;
  acknowledgedAlerts: ComputedRef<Alert[]>;
  resolvedAlerts: ComputedRef<Alert[]>;
  fetchAlerts: () => Promise<void>;
  createAlert: (alert: Partial<Alert>) => Promise<Alert>;
  updateAlert: (id: string, updates: Partial<Alert>) => Promise<Alert>;
  deleteAlert: (id: string) => Promise<void>;
  acknowledgeAlert: (id: string, userId: string) => Promise<Alert>;
  resolveAlert: (id: string, userId: string, resolution?: string) => Promise<Alert>;
  filterBySeverity: (severity: string) => Alert[];
  filterByStatus: (status: string) => Alert[];
  clearError: () => void;
}

export declare function useAlerts(integrationId?: string): UseAlertsReturn;

export interface CloudWatchMetric {
  MetricName: string;
  Value: number;
  Unit: string;
  Timestamp: string;
  Dimensions?: Array<{ Name: string; Value: string }>;
}

export interface CloudWatchEvent {
  id: string;
  type: string;
  message: string;
  timestamp: string;
  metadata?: any;
}

export interface UseCloudWatchReturn {
  metrics: Ref<CloudWatchMetric[]>;
  events: Ref<CloudWatchEvent[]>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
  hasError: ComputedRef<boolean>;
  errorMetrics: ComputedRef<CloudWatchMetric[]>;
  highLatencyMetrics: ComputedRef<CloudWatchMetric[]>;
  errorEvents: ComputedRef<CloudWatchEvent[]>;
  log: (message: string, metadata?: any) => void;
  logMetric: (name: string, value: number, unit?: string, dimensions?: any) => void;
  logEvent: (type: string, message: string, metadata?: any) => void;
  logError: (error: Error, context?: any) => void;
  startTimer: (name: string) => { end: () => void };
  getMetrics: (filter?: any) => Promise<CloudWatchMetric[]>;
  getEvents: (filter?: any) => Promise<CloudWatchEvent[]>;
  query: (params: any) => Promise<any>;
  createDashboard: (config: any) => Promise<any>;
  setDefaultDimensions: (dimensions: any) => void;
  refreshData: () => Promise<void>;
  clearError: () => void;
}

export declare function useCloudWatch(namespace?: string): UseCloudWatchReturn;

// Component Props Types
export interface IntegrationCardProps {
  integration: Integration;
  showDetails?: boolean;
  isSelected?: boolean;
}

export interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large' | 'xlarge';
  color?: string;
  message?: string;
  fullScreen?: boolean;
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info';
  strokeWidth?: number;
}

export interface ErrorBoundaryProps {
  fallback?: string | Error;
  onError?: (error: Error, instance: any, info: string) => void;
  onReset?: () => void;
  showDetails?: boolean;
  variant?: 'default' | 'minimal' | 'full';
  title?: string;
  message?: string;
  retryText?: string;
  captureErrors?: boolean;
}

export interface ModalProps {
  modelValue: boolean;
  title?: string;
  size?: 'small' | 'medium' | 'large' | 'xlarge' | 'full';
  centered?: boolean;
  closeOnOverlay?: boolean;
  closeOnEscape?: boolean;
  hideHeader?: boolean;
  hideFooter?: boolean;
  hideCloseButton?: boolean;
  showDefaultFooter?: boolean;
  confirmText?: string;
  cancelText?: string;
  closeAriaLabel?: string;
  bodyStyle?: Record<string, any>;
  zIndex?: number;
  trapFocus?: boolean;
}

export interface AlertsPanelProps {
  integrationId?: string;
}

// Re-export core types
export * from '@friggframework/ui-core';

// Default export
declare const _default: Plugin;
export default _default;