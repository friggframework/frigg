/**
 * Vue composable for accessing and configuring ui-core instance
 */

import { ref, computed, onMounted } from 'vue';
import { friggUICore, createFriggUICore } from '@friggframework/ui-core';
import { vuePlugin } from '../plugins/VuePlugin.js';

export function useFriggCore(config = null) {
  const core = ref(null);
  const isInitialized = ref(false);
  const error = ref(null);

  const hasError = computed(() => error.value !== null);

  // Initialize core instance
  const initialize = (customConfig = null) => {
    try {
      if (customConfig || config) {
        // Create new instance with custom config
        core.value = createFriggUICore(customConfig || config);
      } else {
        // Use singleton instance
        core.value = friggUICore;
      }

      // Register and activate Vue plugin
      core.value.registerPlugin(vuePlugin);
      core.value.activateFramework('vue');
      
      isInitialized.value = true;
      error.value = null;
    } catch (err) {
      error.value = err;
      console.error('Failed to initialize Frigg UI Core:', err);
    }
  };

  // Update configuration
  const updateConfig = (newConfig) => {
    if (core.value) {
      core.value.updateConfig(newConfig);
    }
  };

  // Get services
  const getToastManager = () => {
    return core.value?.getToastManager();
  };

  const getApiService = () => {
    return core.value?.getApiService();
  };

  const getCloudWatchService = () => {
    return core.value?.getCloudWatchService();
  };

  const getAlertsService = () => {
    return core.value?.getAlertsService();
  };

  // Plugin management
  const registerPlugin = (plugin) => {
    if (core.value) {
      core.value.registerPlugin(plugin);
    }
  };

  const activateFramework = (frameworkName) => {
    if (core.value) {
      core.value.activateFramework(frameworkName);
    }
  };

  // Component and adapter access
  const getComponent = (name) => {
    return core.value?.getComponent(name);
  };

  const getAdapter = (name) => {
    return core.value?.getAdapter(name);
  };

  const callHook = (name, ...args) => {
    return core.value?.callHook(name, ...args);
  };

  // Auto-initialize if config provided
  onMounted(() => {
    if (config || !core.value) {
      initialize();
    }
  });

  return {
    // State
    core,
    isInitialized,
    error,
    hasError,
    
    // Initialization
    initialize,
    updateConfig,
    
    // Services
    getToastManager,
    getApiService,
    getCloudWatchService,
    getAlertsService,
    
    // Plugin management
    registerPlugin,
    activateFramework,
    
    // Framework integration
    getComponent,
    getAdapter,
    callHook
  };
}