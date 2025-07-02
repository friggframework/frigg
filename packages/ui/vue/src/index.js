/**
 * @friggframework/ui-vue
 * Vue.js bindings for @friggframework/ui-core integration platform
 */

// Re-export ui-core for convenience
export * from '@friggframework/ui-core';

// Export Vue-specific functionality
export * from './composables/index.js';
export * from './plugins/index.js';
export * from './components/index.js';

// Main plugin installation
import { install } from './plugins/VuePlugin.js';

export default {
  install
};

// Named export for plugin
export { install };