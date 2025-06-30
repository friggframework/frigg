/**
 * API clients and services
 * Framework-agnostic HTTP clients for Frigg platform
 */

export { default as ApiClient } from './ApiClient.js';
export { MonitoringApiService } from './MonitoringApiService.js';

// Re-export for backward compatibility
export { default as API } from './ApiClient.js';