/**
 * Svelte plugin adapter for @friggframework/ui-core
 * Implements FrameworkPlugin interface for Svelte-specific functionality
 */

import { FrameworkPlugin, FrameworkAdapter, HOOKS, COMPONENTS, ADAPTERS } from '@friggframework/ui-core/plugins';
import { writable, readable, derived, get } from 'svelte/store';
import { onMount, onDestroy, setContext, getContext, tick } from 'svelte';

/**
 * Svelte-specific adapter for framework integration
 */
export class SvelteAdapter extends FrameworkAdapter {
  constructor() {
    super('svelte');
  }

  // Svelte store creation
  createState(initialState) {
    if (typeof initialState === 'object' && initialState !== null) {
      // For objects, create a writable store
      return writable(initialState);
    }
    // For primitives, also use writable
    return writable(initialState);
  }

  // Svelte reactive subscriptions
  createEffect(callback, dependencies) {
    if (Array.isArray(dependencies) && dependencies.length > 0) {
      // Create a derived store that runs the callback
      const effect = derived(dependencies, (values) => {
        callback(values);
        return values;
      });
      
      // Subscribe to trigger the effect
      const unsubscribe = effect.subscribe(() => {});
      return unsubscribe;
    }
    
    // If no dependencies, run immediately and return no-op
    callback();
    return () => {};
  }

  // Svelte component creation helper
  createElement(type, props = {}, children = []) {
    // In Svelte, we don't create elements directly
    // This returns a component descriptor for use in dynamic components
    return {
      type,
      props,
      children,
      framework: 'svelte'
    };
  }

  // Svelte event binding
  bindEvent(element, event, handler) {
    if (element && element.addEventListener) {
      element.addEventListener(event, handler);
      return () => element.removeEventListener(event, handler);
    }
    return () => {};
  }

  // Svelte-specific computed values using derived stores
  createComputed(getter, dependencies = []) {
    if (dependencies.length === 0) {
      // If no dependencies, create a readable store
      return readable(getter());
    }
    // Create a derived store
    return derived(dependencies, () => getter());
  }

  // Svelte tick wrapper for DOM updates
  nextTick(callback) {
    return tick().then(callback);
  }

  // Svelte context API wrappers
  setContext(key, value) {
    return setContext(key, value);
  }

  getContext(key) {
    return getContext(key);
  }

  // Svelte lifecycle helpers
  onMount(callback) {
    return onMount(callback);
  }

  onDestroy(callback) {
    return onDestroy(callback);
  }

  // Get store value synchronously
  getStoreValue(store) {
    return get(store);
  }

  // Create a custom store with subscribe method
  createCustomStore(initialValue, start) {
    return readable(initialValue, start);
  }
}

/**
 * Svelte Framework Plugin for ui-core
 */
export class SveltePlugin extends FrameworkPlugin {
  constructor() {
    super('svelte', '4.x|5.x');
    this.adapter = new SvelteAdapter();
    this.setupHooks();
    this.setupAdapters();
  }

  setupHooks() {
    // State management hook using Svelte stores
    this.registerHook(HOOKS.STATE_MANAGER, (initialState) => {
      return this.adapter.createState(initialState);
    });

    // Effect management hook using Svelte reactivity
    this.registerHook(HOOKS.EFFECT_MANAGER, (callback, dependencies) => {
      return this.adapter.createEffect(callback, dependencies);
    });

    // Event management hook
    this.registerHook(HOOKS.EVENT_MANAGER, (element, event, handler) => {
      return this.adapter.bindEvent(element, event, handler);
    });

    // Component renderer hook for dynamic components
    this.registerHook(HOOKS.COMPONENT_RENDERER, (type, props, children) => {
      return this.adapter.createElement(type, props, children);
    });

    // HTTP client hook - delegate to ui-core's ApiClient
    this.registerHook(HOOKS.HTTP_CLIENT, (config) => {
      // This will be handled by ui-core's ApiClient
      return null;
    });
  }

  setupAdapters() {
    // State adapter for Svelte stores
    this.registerAdapter(ADAPTERS.STATE, {
      create: (initialState) => this.adapter.createState(initialState),
      writable: (value, start) => writable(value, start),
      readable: (value, start) => readable(value, start),
      derived: (stores, fn, initialValue) => derived(stores, fn, initialValue),
      get: (store) => get(store),
      // Custom store creation helper
      custom: (initialValue, start) => this.adapter.createCustomStore(initialValue, start)
    });

    // Effects adapter for Svelte lifecycle
    this.registerAdapter(ADAPTERS.EFFECTS, {
      onMount: (callback) => onMount(callback),
      onDestroy: (callback) => onDestroy(callback),
      tick: () => tick(),
      // Subscribe to store changes
      subscribe: (store, callback) => {
        return store.subscribe(callback);
      },
      // Create reactive effect
      effect: (callback, dependencies) => this.adapter.createEffect(callback, dependencies)
    });

    // Events adapter
    this.registerAdapter(ADAPTERS.EVENTS, {
      bind: (element, event, handler) => this.adapter.bindEvent(element, event, handler),
      dispatch: (element, event, detail) => {
        if (element && element.dispatchEvent) {
          const customEvent = new CustomEvent(event, { detail });
          element.dispatchEvent(customEvent);
        }
      },
      // Svelte-specific event forwarding
      forward: (component, event) => {
        return (e) => component.dispatchEvent(new CustomEvent(event, { detail: e.detail }));
      }
    });

    // Context adapter for Svelte's context API
    this.registerAdapter('context', {
      set: (key, value) => setContext(key, value),
      get: (key) => getContext(key),
      has: (key) => {
        try {
          getContext(key);
          return true;
        } catch {
          return false;
        }
      }
    });
  }

  // Svelte-specific initialization
  init(core) {
    // Store reference to ui-core instance
    this.core = core;
    
    // Set up Svelte-specific components
    this.setupComponents();
    
    // Create a context key for ui-core
    this.contextKey = Symbol('frigg-ui-core');
    
    console.log('Svelte plugin initialized with ui-core');
  }

  setupComponents() {
    // Register Svelte component factories
    // These will be implemented as actual Svelte components
    this.registerComponent(COMPONENTS.TOAST, 'ToastNotification');
    this.registerComponent(COMPONENTS.MODAL, 'Modal');
    this.registerComponent(COMPONENTS.LOADING_SPINNER, 'LoadingSpinner');
    this.registerComponent(COMPONENTS.BUTTON, 'Button');
    this.registerComponent(COMPONENTS.INPUT, 'Input');
    this.registerComponent(COMPONENTS.TABLE, 'Table');
    this.registerComponent(COMPONENTS.FORM, 'Form');
  }

  // Svelte-specific cleanup
  destroy(core) {
    console.log('Svelte plugin destroyed');
  }

  // Get Svelte adapter
  getSvelteAdapter() {
    return this.adapter;
  }

  // Helper to create a Svelte-compatible store from ui-core service
  createStoreFromService(service, transformFn) {
    const { subscribe } = writable(transformFn ? transformFn(service.getState()) : service.getState());
    
    // Subscribe to service updates
    const unsubscribe = service.subscribe((state) => {
      subscribe.set(transformFn ? transformFn(state) : state);
    });

    return {
      subscribe,
      unsubscribe
    };
  }

  // Helper to provide ui-core instance via context
  provideCore(core) {
    setContext(this.contextKey, core);
  }

  // Helper to get ui-core instance from context
  getCore() {
    return getContext(this.contextKey);
  }
}

// Export plugin instance
export const sveltePlugin = new SveltePlugin();

// Svelte-specific installation helper
export function installSveltePlugin(core) {
  core.registerPlugin(sveltePlugin);
  core.activateFramework('svelte');
  return sveltePlugin;
}