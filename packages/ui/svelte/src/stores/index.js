/**
 * Svelte stores for @friggframework/ui-core integration
 */

// Toast store and utilities
export {
  toastStore,
  toast,
  success,
  error,
  warning,
  info,
  dismiss,
  dismissAll,
  clear,
  toastCount,
  activeToasts
} from './toast.js';

// API store and utilities
export {
  apiStore,
  api,
  apiLoading,
  apiErrors
} from './api.js';

// Alerts store and utilities
export {
  alertsStore,
  criticalAlerts,
  warningAlerts,
  infoAlerts,
  unreadAlerts,
  alertCounts,
  createAlert
} from './alerts.js';

// CloudWatch monitoring store and utilities
export {
  cloudWatchStore,
  allMetrics,
  metricStats,
  healthStatus
} from './cloudwatch.js';

// Core store for ui-core instance
export { coreStore, initializeCore } from './core.js';