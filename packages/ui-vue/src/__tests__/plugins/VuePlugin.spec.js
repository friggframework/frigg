import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp } from 'vue';
import { VuePlugin, VueAdapter, vuePlugin, install } from '../../plugins/VuePlugin';
import { HOOKS, ADAPTERS } from '@friggframework/ui-core/plugins';

// Mock ui-core
vi.mock('@friggframework/ui-core/plugins', () => ({
  FrameworkPlugin: class FrameworkPlugin {
    constructor(name, version) {
      this.name = name;
      this.version = version;
      this.hooks = new Map();
      this.adapters = new Map();
    }
    
    registerHook(name, handler) {
      this.hooks.set(name, handler);
    }
    
    registerAdapter(name, adapter) {
      this.adapters.set(name, adapter);
    }
    
    init(core) {
      this.core = core;
    }
    
    destroy() {}
  },
  FrameworkAdapter: class FrameworkAdapter {
    constructor(name) {
      this.name = name;
    }
  },
  HOOKS: {
    STATE_MANAGER: 'state-manager',
    EFFECT_MANAGER: 'effect-manager',
    EVENT_MANAGER: 'event-manager',
    COMPONENT_RENDERER: 'component-renderer',
    HTTP_CLIENT: 'http-client'
  },
  COMPONENTS: {},
  ADAPTERS: {
    STATE: 'state',
    EFFECTS: 'effects',
    EVENTS: 'events'
  }
}));

describe('VueAdapter', () => {
  let adapter;

  beforeEach(() => {
    adapter = new VueAdapter();
  });

  it('should create VueAdapter with correct name', () => {
    expect(adapter.name).toBe('vue');
  });

  it('should create reactive state for objects', () => {
    const initialState = { count: 0, name: 'test' };
    const state = adapter.createState(initialState);
    
    expect(state).toBeDefined();
    expect(state.count).toBe(0);
    expect(state.name).toBe('test');
  });

  it('should create ref for primitive values', () => {
    const state = adapter.createState(42);
    
    expect(state).toBeDefined();
    expect(state.value).toBe(42);
  });

  it('should create effect with dependencies', () => {
    const callback = vi.fn();
    const deps = [{ value: 1 }, { value: 2 }];
    
    const unwatch = adapter.createEffect(callback, deps);
    
    expect(typeof unwatch).toBe('function');
  });

  it('should create element structure', () => {
    const element = adapter.createElement('div', { class: 'test' }, ['Hello']);
    
    expect(element).toEqual({
      type: 'div',
      props: { class: 'test' },
      children: ['Hello']
    });
  });

  it('should bind events to elements', () => {
    const element = document.createElement('button');
    const handler = vi.fn();
    
    const unbind = adapter.bindEvent(element, 'click', handler);
    
    element.click();
    expect(handler).toHaveBeenCalled();
    
    unbind();
    element.click();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should handle null element in bindEvent', () => {
    const unbind = adapter.bindEvent(null, 'click', vi.fn());
    expect(typeof unbind).toBe('function');
    unbind(); // Should not throw
  });

  it('should create computed values', () => {
    const getter = vi.fn(() => 42);
    const computed = adapter.createComputed(getter);
    
    expect(computed.value).toBe(42);
  });

  it('should wrap nextTick', async () => {
    let executed = false;
    await adapter.nextTick(() => {
      executed = true;
    });
    
    expect(executed).toBe(true);
  });
});

describe('VuePlugin', () => {
  let plugin;
  let mockCore;

  beforeEach(() => {
    plugin = new VuePlugin();
    mockCore = {
      registerPlugin: vi.fn(),
      activateFramework: vi.fn()
    };
  });

  it('should create VuePlugin with correct properties', () => {
    expect(plugin.name).toBe('vue');
    expect(plugin.version).toBe('3.x');
    expect(plugin.adapter).toBeInstanceOf(VueAdapter);
  });

  it('should register all required hooks', () => {
    expect(plugin.hooks.has(HOOKS.STATE_MANAGER)).toBe(true);
    expect(plugin.hooks.has(HOOKS.EFFECT_MANAGER)).toBe(true);
    expect(plugin.hooks.has(HOOKS.EVENT_MANAGER)).toBe(true);
    expect(plugin.hooks.has(HOOKS.COMPONENT_RENDERER)).toBe(true);
    expect(plugin.hooks.has(HOOKS.HTTP_CLIENT)).toBe(true);
  });

  it('should register all required adapters', () => {
    expect(plugin.adapters.has(ADAPTERS.STATE)).toBe(true);
    expect(plugin.adapters.has(ADAPTERS.EFFECTS)).toBe(true);
    expect(plugin.adapters.has(ADAPTERS.EVENTS)).toBe(true);
  });

  it('should execute state manager hook', () => {
    const stateHook = plugin.hooks.get(HOOKS.STATE_MANAGER);
    const state = stateHook({ count: 0 });
    
    expect(state).toBeDefined();
    expect(state.count).toBe(0);
  });

  it('should execute effect manager hook', () => {
    const effectHook = plugin.hooks.get(HOOKS.EFFECT_MANAGER);
    const callback = vi.fn();
    
    const cleanup = effectHook(callback, []);
    expect(typeof cleanup).toBe('function');
  });

  it('should execute event manager hook', () => {
    const eventHook = plugin.hooks.get(HOOKS.EVENT_MANAGER);
    const element = document.createElement('div');
    const handler = vi.fn();
    
    const cleanup = eventHook(element, 'click', handler);
    expect(typeof cleanup).toBe('function');
  });

  it('should execute component renderer hook', () => {
    const componentHook = plugin.hooks.get(HOOKS.COMPONENT_RENDERER);
    const vnode = componentHook('button', { disabled: true }, ['Click me']);
    
    expect(vnode).toEqual({
      type: 'button',
      props: { disabled: true },
      children: ['Click me']
    });
  });

  it('should return null for HTTP client hook', () => {
    const httpHook = plugin.hooks.get(HOOKS.HTTP_CLIENT);
    const result = httpHook({ baseURL: '/api' });
    
    expect(result).toBe(null);
  });

  it('should initialize plugin with core', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    plugin.init(mockCore);
    
    expect(plugin.core).toBe(mockCore);
    expect(consoleSpy).toHaveBeenCalledWith('Vue plugin initialized with ui-core');
    
    consoleSpy.mockRestore();
  });

  it('should destroy plugin', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    plugin.destroy(mockCore);
    
    expect(consoleSpy).toHaveBeenCalledWith('Vue plugin destroyed');
    
    consoleSpy.mockRestore();
  });

  it('should get Vue adapter', () => {
    const adapter = plugin.getVueAdapter();
    
    expect(adapter).toBe(plugin.adapter);
    expect(adapter).toBeInstanceOf(VueAdapter);
  });

  it('should provide state adapter methods', () => {
    const stateAdapter = plugin.adapters.get(ADAPTERS.STATE);
    
    expect(stateAdapter.create).toBeDefined();
    expect(stateAdapter.reactive).toBeDefined();
    expect(stateAdapter.ref).toBeDefined();
    expect(stateAdapter.computed).toBeDefined();
    
    const state = stateAdapter.create({ count: 0 });
    expect(state.count).toBe(0);
    
    const refValue = stateAdapter.ref(42);
    expect(refValue.value).toBe(42);
  });

  it('should provide effects adapter methods', () => {
    const effectsAdapter = plugin.adapters.get(ADAPTERS.EFFECTS);
    
    expect(effectsAdapter.watch).toBeDefined();
    expect(effectsAdapter.watchEffect).toBeDefined();
    expect(effectsAdapter.nextTick).toBeDefined();
  });

  it('should provide events adapter methods', () => {
    const eventsAdapter = plugin.adapters.get(ADAPTERS.EVENTS);
    
    expect(eventsAdapter.bind).toBeDefined();
    expect(eventsAdapter.emit).toBeDefined();
    
    const element = document.createElement('button');
    const handler = vi.fn();
    
    const unbind = eventsAdapter.bind(element, 'click', handler);
    element.click();
    
    expect(handler).toHaveBeenCalled();
    expect(typeof unbind).toBe('function');
  });

  it('should emit events on Vue instance', () => {
    const eventsAdapter = plugin.adapters.get(ADAPTERS.EVENTS);
    const mockInstance = { emit: vi.fn() };
    
    eventsAdapter.emit(mockInstance, 'custom-event', 'data1', 'data2');
    
    expect(mockInstance.emit).toHaveBeenCalledWith('custom-event', 'data1', 'data2');
  });

  it('should handle emit with no instance', () => {
    const eventsAdapter = plugin.adapters.get(ADAPTERS.EVENTS);
    
    // Should not throw
    expect(() => {
      eventsAdapter.emit(null, 'event');
    }).not.toThrow();
  });
});

describe('Vue Plugin Installation', () => {
  it('should export singleton plugin instance', () => {
    expect(vuePlugin).toBeDefined();
    expect(vuePlugin).toBeInstanceOf(VuePlugin);
  });

  it('should install plugin on Vue app', () => {
    const app = {
      config: {
        globalProperties: {}
      }
    };
    
    const mockCore = {
      registerPlugin: vi.fn(),
      activateFramework: vi.fn()
    };
    
    const result = install(app, { core: mockCore });
    
    expect(result).toBe(app);
    expect(app.config.globalProperties.$frigg).toBe(mockCore);
    expect(mockCore.registerPlugin).toHaveBeenCalledWith(vuePlugin);
    expect(mockCore.activateFramework).toHaveBeenCalledWith('vue');
  });

  it('should install without core', () => {
    const app = {
      config: {
        globalProperties: {}
      }
    };
    
    const result = install(app);
    
    expect(result).toBe(app);
    expect(app.config.globalProperties.$frigg).toBe(null);
  });

  it('should install with empty options', () => {
    const app = {
      config: {
        globalProperties: {}
      }
    };
    
    const result = install(app, {});
    
    expect(result).toBe(app);
    expect(app.config.globalProperties.$frigg).toBe(null);
  });
});

describe('Plugin Integration', () => {
  it('should create complete plugin system', () => {
    const plugin = new VuePlugin();
    
    // Test all hooks are callable
    plugin.hooks.forEach((handler, name) => {
      expect(() => {
        if (name === HOOKS.STATE_MANAGER) {
          handler({ test: true });
        } else if (name === HOOKS.HTTP_CLIENT) {
          handler({});
        } else {
          handler(() => {}, []);
        }
      }).not.toThrow();
    });
    
    // Test all adapters are functional
    plugin.adapters.forEach((adapter) => {
      expect(adapter).toBeDefined();
      expect(typeof adapter).toBe('object');
    });
  });
});