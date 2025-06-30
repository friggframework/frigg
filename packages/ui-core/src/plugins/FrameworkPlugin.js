/**
 * Framework plugin system for ui-core
 * Allows binding core functionality to different UI frameworks
 */

export class FrameworkPlugin {
  constructor(name, version) {
    this.name = name;
    this.version = version;
    this.hooks = new Map();
    this.components = new Map();
    this.adapters = new Map();
  }

  // Register framework-specific hooks
  registerHook(name, implementation) {
    this.hooks.set(name, implementation);
    return this;
  }

  // Register framework-specific components
  registerComponent(name, component) {
    this.components.set(name, component);
    return this;
  }

  // Register framework adapters
  registerAdapter(name, adapter) {
    this.adapters.set(name, adapter);
    return this;
  }

  // Get hook implementation
  getHook(name) {
    return this.hooks.get(name);
  }

  // Get component
  getComponent(name) {
    return this.components.get(name);
  }

  // Get adapter
  getAdapter(name) {
    return this.adapters.get(name);
  }

  // Check if hook exists
  hasHook(name) {
    return this.hooks.has(name);
  }

  // Install plugin into core
  install(core) {
    if (core.plugins) {
      core.plugins.set(this.name, this);
    }
    
    // Call plugin initialization if available
    if (this.init && typeof this.init === 'function') {
      this.init(core);
    }
  }

  // Uninstall plugin from core
  uninstall(core) {
    if (core.plugins) {
      core.plugins.delete(this.name);
    }
    
    // Call plugin cleanup if available
    if (this.destroy && typeof this.destroy === 'function') {
      this.destroy(core);
    }
  }
}

/**
 * Plugin manager for handling multiple framework plugins
 */
export class PluginManager {
  constructor() {
    this.plugins = new Map();
    this.activeFramework = null;
  }

  register(plugin) {
    if (!(plugin instanceof FrameworkPlugin)) {
      throw new Error('Plugin must be an instance of FrameworkPlugin');
    }
    
    this.plugins.set(plugin.name, plugin);
    return this;
  }

  unregister(pluginName) {
    const plugin = this.plugins.get(pluginName);
    if (plugin && this.activeFramework === pluginName) {
      this.activeFramework = null;
    }
    return this.plugins.delete(pluginName);
  }

  activate(pluginName) {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      throw new Error(`Plugin '${pluginName}' not found`);
    }
    
    this.activeFramework = pluginName;
    return plugin;
  }

  getActive() {
    return this.activeFramework ? this.plugins.get(this.activeFramework) : null;
  }

  getPlugin(name) {
    return this.plugins.get(name);
  }

  getAllPlugins() {
    return Array.from(this.plugins.values());
  }

  // Framework-agnostic hook caller
  callHook(hookName, ...args) {
    const activePlugin = this.getActive();
    if (activePlugin && activePlugin.hasHook(hookName)) {
      return activePlugin.getHook(hookName)(...args);
    }
    return null;
  }

  // Get framework-specific component
  getComponent(componentName) {
    const activePlugin = this.getActive();
    if (activePlugin) {
      return activePlugin.getComponent(componentName);
    }
    return null;
  }

  // Get framework-specific adapter
  getAdapter(adapterName) {
    const activePlugin = this.getActive();
    if (activePlugin) {
      return activePlugin.getAdapter(adapterName);
    }
    return null;
  }
}

/**
 * Base adapter class for framework-specific implementations
 */
export class FrameworkAdapter {
  constructor(framework) {
    this.framework = framework;
  }

  // Override in framework-specific adapters
  createState(initialState) {
    throw new Error('createState must be implemented by framework adapter');
  }

  createEffect(callback, dependencies) {
    throw new Error('createEffect must be implemented by framework adapter');
  }

  createElement(type, props, children) {
    throw new Error('createElement must be implemented by framework adapter');
  }

  bindEvent(element, event, handler) {
    throw new Error('bindEvent must be implemented by framework adapter');
  }
}

// Standard hook names
export const HOOKS = {
  STATE_MANAGER: 'stateManager',
  EFFECT_MANAGER: 'effectManager',
  EVENT_MANAGER: 'eventManager',
  COMPONENT_RENDERER: 'componentRenderer',
  ROUTER: 'router',
  HTTP_CLIENT: 'httpClient'
};

// Standard component names
export const COMPONENTS = {
  TOAST: 'Toast',
  BUTTON: 'Button',
  INPUT: 'Input',
  MODAL: 'Modal',
  LOADING_SPINNER: 'LoadingSpinner',
  TABLE: 'Table',
  FORM: 'Form'
};

// Standard adapter names
export const ADAPTERS = {
  STATE: 'state',
  EFFECTS: 'effects',
  EVENTS: 'events',
  ROUTING: 'routing'
};