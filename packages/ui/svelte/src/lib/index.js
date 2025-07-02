/**
 * Main exports for @friggframework/ui-svelte
 */

// Re-export everything from ui-core for convenience
export * from '@friggframework/ui-core';

// Export Svelte plugin
export * from '../plugins/index.js';

// Export all stores
export * from '../stores/index.js';

// Export all components
export * from '../components/index.js';

// Export all actions
export * from '../actions/index.js';

// Export utility functions
export { initializeSvelteFrigg, getSvelteCore } from './utils.js';