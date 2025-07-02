/**
 * @friggframework/ui-core
 * Framework-agnostic UI utilities and business logic
 */

// Export all modules
export * from './api/index.js';
export * from './state/index.js';
export * from './utils/index.js';
export * from './models/index.js';
export * from './services/index.js';
export * from './plugins/index.js';

// Core class that ties everything together
import { PluginManager } from './plugins/index.js';
import { toastManager } from './state/index.js';
import { MonitoringApiService } from './api/index.js';
import { CloudWatchService, AlertsService } from './services/index.js';

export class FriggUICore {
  constructor(config = {}) {
    this.config = config;
    this.plugins = new PluginManager();
    this.toast = toastManager;
    
    // Initialize services
    this.api = new MonitoringApiService(config.api);
    this.cloudWatch = new CloudWatchService(this.api);
    this.alerts = new AlertsService(this.api);
    
    // Framework-specific adapters
    this.adapters = {};
  }

  // Plugin management
  registerPlugin(plugin) {
    this.plugins.register(plugin);
    plugin.install(this);
    return this;
  }

  activateFramework(frameworkName) {
    this.plugins.activate(frameworkName);
    return this;
  }

  // Get framework-specific implementations
  getComponent(name) {
    return this.plugins.getComponent(name);
  }

  getAdapter(name) {
    return this.plugins.getAdapter(name);
  }

  callHook(name, ...args) {
    return this.plugins.callHook(name, ...args);
  }

  // Service accessors
  getToastManager() {
    return this.toast;
  }

  getApiService() {
    return this.api;
  }

  getCloudWatchService() {
    return this.cloudWatch;
  }

  getAlertsService() {
    return this.alerts;
  }

  // Configuration
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    // Update service configurations
    if (newConfig.api) {
      this.api = new MonitoringApiService({ ...this.config.api, ...newConfig.api });
      this.cloudWatch = new CloudWatchService(this.api);
      this.alerts = new AlertsService(this.api);
    }
    
    return this;
  }
}

// Create singleton instance
export const friggUICore = new FriggUICore();

// Export convenience function for creating new instances
export function createFriggUICore(config) {
  return new FriggUICore(config);
}