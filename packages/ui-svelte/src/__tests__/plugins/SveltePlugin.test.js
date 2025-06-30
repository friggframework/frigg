import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SveltePlugin, SvelteAdapter, sveltePlugin } from '../../plugins/SveltePlugin.js';
import { writable, readable, derived } from 'svelte/store';

describe('SveltePlugin', () => {
  let plugin;
  let adapter;

  beforeEach(() => {
    plugin = new SveltePlugin();
    adapter = plugin.adapter;
  });

  describe('SvelteAdapter', () => {
    it('should create writable stores for state', () => {
      const initialState = { count: 0 };
      const store = adapter.createState(initialState);
      
      expect(store.subscribe).toBeDefined();
      expect(store.set).toBeDefined();
      expect(store.update).toBeDefined();
    });

    it('should create writable stores for primitive values', () => {
      const store = adapter.createState(42);
      
      expect(store.subscribe).toBeDefined();
      expect(store.set).toBeDefined();
    });

    it('should create computed values with derived stores', () => {
      const value = writable(10);
      const computed = adapter.createComputed(() => value * 2, [value]);
      
      expect(computed.subscribe).toBeDefined();
    });

    it('should handle effects with dependencies', () => {
      const dep1 = writable(1);
      const dep2 = writable(2);
      const callback = vi.fn();
      
      const unsubscribe = adapter.createEffect(callback, [dep1, dep2]);
      
      expect(typeof unsubscribe).toBe('function');
      expect(callback).toHaveBeenCalled();
    });

    it('should bind and unbind events', () => {
      const element = document.createElement('button');
      const handler = vi.fn();
      
      const unbind = adapter.bindEvent(element, 'click', handler);
      
      element.click();
      expect(handler).toHaveBeenCalledTimes(1);
      
      unbind();
      element.click();
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('SveltePlugin', () => {
    it('should have correct name and version', () => {
      expect(plugin.name).toBe('svelte');
      expect(plugin.version).toBe('4.x|5.x');
    });

    it('should register all required hooks', () => {
      expect(plugin.hasHook('stateManager')).toBe(true);
      expect(plugin.hasHook('effectManager')).toBe(true);
      expect(plugin.hasHook('eventManager')).toBe(true);
      expect(plugin.hasHook('componentRenderer')).toBe(true);
      expect(plugin.hasHook('httpClient')).toBe(true);
    });

    it('should register all required adapters', () => {
      expect(plugin.getAdapter('state')).toBeDefined();
      expect(plugin.getAdapter('effects')).toBeDefined();
      expect(plugin.getAdapter('events')).toBeDefined();
      expect(plugin.getAdapter('context')).toBeDefined();
    });

    it('should initialize with core instance', () => {
      const mockCore = { name: 'test-core' };
      plugin.init(mockCore);
      
      expect(plugin.core).toBe(mockCore);
      expect(plugin.contextKey).toBeDefined();
    });

    it('should create store from service', () => {
      const mockService = {
        getState: () => ({ value: 42 }),
        subscribe: vi.fn()
      };
      
      const store = plugin.createStoreFromService(mockService);
      
      expect(store.subscribe).toBeDefined();
      expect(store.unsubscribe).toBeDefined();
    });

    it('should transform service state when creating store', () => {
      const mockService = {
        getState: () => ({ nested: { value: 42 } }),
        subscribe: vi.fn()
      };
      
      const transformFn = (state) => state.nested.value;
      const store = plugin.createStoreFromService(mockService, transformFn);
      
      expect(store.subscribe).toBeDefined();
    });
  });

  describe('Module exports', () => {
    it('should export singleton plugin instance', () => {
      expect(sveltePlugin).toBeInstanceOf(SveltePlugin);
    });
  });
});