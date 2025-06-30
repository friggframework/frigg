/**
 * Vue.js plugin adapter for @friggframework/ui-core
 * Implements FrameworkPlugin interface for Vue-specific functionality
 */

import { FrameworkPlugin, FrameworkAdapter, HOOKS, COMPONENTS, ADAPTERS } from '@friggframework/ui-core/plugins';
import { ref, reactive, watch, computed, nextTick } from 'vue';

/**
 * Vue-specific adapter for framework integration
 */
export class VueAdapter extends FrameworkAdapter {
  constructor() {
    super('vue');
  }

  // Vue reactive state management
  createState(initialState) {
    if (typeof initialState === 'object' && initialState !== null) {
      return reactive(initialState);
    }
    return ref(initialState);
  }

  // Vue watcher for effects
  createEffect(callback, dependencies) {
    if (Array.isArray(dependencies)) {
      return watch(dependencies, callback, { immediate: true });
    }
    return watch(callback, callback, { immediate: true });
  }

  // Vue component creation helper
  createElement(type, props = {}, children = []) {
    return {
      type,
      props,
      children
    };
  }

  // Vue event binding
  bindEvent(element, event, handler) {
    if (element && element.addEventListener) {
      element.addEventListener(event, handler);
      return () => element.removeEventListener(event, handler);
    }
    return () => {};
  }

  // Vue-specific computed values
  createComputed(getter) {
    return computed(getter);
  }

  // Vue nextTick wrapper
  nextTick(callback) {
    return nextTick(callback);
  }
}

/**
 * Vue.js Framework Plugin for ui-core
 */
export class VuePlugin extends FrameworkPlugin {
  constructor() {
    super('vue', '3.x');
    this.adapter = new VueAdapter();
    this.setupHooks();
    this.setupAdapters();
  }

  setupHooks() {
    // State management hook
    this.registerHook(HOOKS.STATE_MANAGER, (initialState) => {
      return this.adapter.createState(initialState);
    });

    // Effect management hook
    this.registerHook(HOOKS.EFFECT_MANAGER, (callback, dependencies) => {
      return this.adapter.createEffect(callback, dependencies);
    });

    // Event management hook
    this.registerHook(HOOKS.EVENT_MANAGER, (element, event, handler) => {
      return this.adapter.bindEvent(element, event, handler);
    });

    // Component renderer hook
    this.registerHook(HOOKS.COMPONENT_RENDERER, (type, props, children) => {
      return this.adapter.createElement(type, props, children);
    });

    // HTTP client hook - use ui-core's API client
    this.registerHook(HOOKS.HTTP_CLIENT, (config) => {
      // This will be handled by ui-core's ApiClient
      return null;
    });
  }

  setupAdapters() {
    // State adapter
    this.registerAdapter(ADAPTERS.STATE, {
      create: (initialState) => this.adapter.createState(initialState),
      reactive: (object) => reactive(object),
      ref: (value) => ref(value),
      computed: (getter) => computed(getter)
    });

    // Effects adapter
    this.registerAdapter(ADAPTERS.EFFECTS, {
      watch: (source, callback, options) => watch(source, callback, options),
      watchEffect: (callback) => watch(callback, callback, { immediate: true }),
      nextTick: (callback) => nextTick(callback)
    });

    // Events adapter
    this.registerAdapter(ADAPTERS.EVENTS, {
      bind: (element, event, handler) => this.adapter.bindEvent(element, event, handler),
      emit: (instance, event, ...args) => {
        if (instance && instance.emit) {
          instance.emit(event, ...args);
        }
      }
    });
  }

  // Vue-specific initialization
  init(core) {
    // Store reference to ui-core instance
    this.core = core;
    
    // Register Vue-specific components if needed
    this.setupComponents();
    
    console.log('Vue plugin initialized with ui-core');
  }

  setupComponents() {
    // Register Vue-specific component factories
    // These will be implemented as composables and components
  }

  // Vue-specific cleanup
  destroy(core) {
    console.log('Vue plugin destroyed');
  }

  // Get Vue adapter
  getVueAdapter() {
    return this.adapter;
  }
}

// Export plugin instance
export const vuePlugin = new VuePlugin();

// Vue plugin installation function
export function install(app, options = {}) {
  // This can be used with app.use() in Vue applications
  app.config.globalProperties.$frigg = options.core || null;
  
  // Install plugin if core is provided
  if (options.core) {
    options.core.registerPlugin(vuePlugin);
    options.core.activateFramework('vue');
  }

  return app;
}