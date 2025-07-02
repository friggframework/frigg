/**
 * Vue provide/inject pattern for Frigg UI Core
 * Allows parent components to provide core instance to all descendants
 */

import { provide, inject, reactive, readonly } from 'vue';
import { useFriggCore } from './useFriggCore.js';

const FRIGG_INJECTION_KEY = Symbol('frigg-ui-core');

/**
 * Provider composable - use in parent/root components
 * @param {Object} config - Optional configuration for UI Core
 */
export function provideFrigg(config = null) {
  const friggCore = useFriggCore(config);
  
  // Create a reactive context
  const context = reactive({
    core: friggCore.core,
    isInitialized: friggCore.isInitialized,
    error: friggCore.error,
    services: {
      toast: friggCore.getToastManager,
      api: friggCore.getApiService,
      cloudWatch: friggCore.getCloudWatchService,
      alerts: friggCore.getAlertsService
    },
    actions: {
      initialize: friggCore.initialize,
      updateConfig: friggCore.updateConfig,
      registerPlugin: friggCore.registerPlugin,
      activateFramework: friggCore.activateFramework
    }
  });
  
  // Provide the context
  provide(FRIGG_INJECTION_KEY, readonly(context));
  
  return friggCore;
}

/**
 * Inject composable - use in child components
 * @param {boolean} required - Whether the injection is required
 * @returns {Object} The Frigg context or null
 */
export function injectFrigg(required = true) {
  const context = inject(FRIGG_INJECTION_KEY, null);
  
  if (!context && required) {
    throw new Error(
      'Frigg UI Core context not found. ' +
      'Make sure to call provideFrigg() in a parent component.'
    );
  }
  
  return context;
}

/**
 * Helper composable that combines inject with specific service access
 */
export function useFriggService(serviceName, required = true) {
  const context = injectFrigg(required);
  
  if (!context) {
    return null;
  }
  
  const serviceGetter = context.services[serviceName];
  if (!serviceGetter) {
    throw new Error(`Unknown Frigg service: ${serviceName}`);
  }
  
  return serviceGetter();
}

/**
 * Typed service accessors
 */
export const useInjectedToast = () => useFriggService('toast');
export const useInjectedApi = () => useFriggService('api');
export const useInjectedCloudWatch = () => useFriggService('cloudWatch');
export const useInjectedAlerts = () => useFriggService('alerts');