import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { useFriggCore } from '../../composables/useFriggCore';

// Mock ui-core
vi.mock('@friggframework/ui-core', () => ({
  friggUICore: {
    registerPlugin: vi.fn(),
    activateFramework: vi.fn(),
    getToastManager: vi.fn(() => ({ showToast: vi.fn() })),
    getApiService: vi.fn(() => ({ request: vi.fn() })),
    getCloudWatchService: vi.fn(() => ({ log: vi.fn() })),
    getAlertsService: vi.fn(() => ({ getAlerts: vi.fn() })),
    updateConfig: vi.fn(),
    getComponent: vi.fn(),
    getAdapter: vi.fn(),
    callHook: vi.fn()
  },
  createFriggUICore: vi.fn(() => ({
    registerPlugin: vi.fn(),
    activateFramework: vi.fn(),
    getToastManager: vi.fn(() => ({ showToast: vi.fn() })),
    getApiService: vi.fn(() => ({ request: vi.fn() })),
    getCloudWatchService: vi.fn(() => ({ log: vi.fn() })),
    getAlertsService: vi.fn(() => ({ getAlerts: vi.fn() })),
    updateConfig: vi.fn(),
    getComponent: vi.fn(),
    getAdapter: vi.fn(),
    callHook: vi.fn()
  }))
}));

describe('useFriggCore', () => {
  let wrapper;
  
  const TestComponent = defineComponent({
    setup() {
      return useFriggCore();
    },
    template: '<div>Test</div>'
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize without config using singleton', async () => {
    wrapper = mount(TestComponent);
    await wrapper.vm.$nextTick();
    
    const { core, isInitialized, hasError } = wrapper.vm.$options.setup();
    
    expect(isInitialized.value).toBe(true);
    expect(hasError.value).toBe(false);
    expect(core.value).toBeDefined();
  });

  it('should create new instance with custom config', async () => {
    const customConfig = { apiUrl: 'https://test.api.com' };
    
    const TestComponentWithConfig = defineComponent({
      setup() {
        return useFriggCore(customConfig);
      },
      template: '<div>Test</div>'
    });
    
    wrapper = mount(TestComponentWithConfig);
    await wrapper.vm.$nextTick();
    
    const { core } = wrapper.vm.$options.setup();
    expect(core.value).toBeDefined();
  });

  it('should provide service accessors', () => {
    wrapper = mount(TestComponent);
    const result = wrapper.vm.$options.setup();
    
    expect(result.getToastManager).toBeDefined();
    expect(result.getApiService).toBeDefined();
    expect(result.getCloudWatchService).toBeDefined();
    expect(result.getAlertsService).toBeDefined();
  });

  it('should handle initialization errors', async () => {
    const { createFriggUICore } = await import('@friggframework/ui-core');
    createFriggUICore.mockImplementationOnce(() => {
      throw new Error('Initialization failed');
    });

    const TestComponentWithError = defineComponent({
      setup() {
        return useFriggCore({ invalid: true });
      },
      template: '<div>Test</div>'
    });
    
    wrapper = mount(TestComponentWithError);
    await wrapper.vm.$nextTick();
    
    const { hasError, error } = wrapper.vm.$options.setup();
    expect(hasError.value).toBe(true);
    expect(error.value).toBeInstanceOf(Error);
  });

  it('should update config', () => {
    wrapper = mount(TestComponent);
    const { updateConfig, core } = wrapper.vm.$options.setup();
    
    const newConfig = { theme: 'dark' };
    updateConfig(newConfig);
    
    expect(core.value.updateConfig).toHaveBeenCalledWith(newConfig);
  });

  it('should register plugins', () => {
    wrapper = mount(TestComponent);
    const { registerPlugin, core } = wrapper.vm.$options.setup();
    
    const mockPlugin = { name: 'test-plugin' };
    registerPlugin(mockPlugin);
    
    expect(core.value.registerPlugin).toHaveBeenCalledWith(mockPlugin);
  });

  it('should activate framework', () => {
    wrapper = mount(TestComponent);
    const { activateFramework, core } = wrapper.vm.$options.setup();
    
    activateFramework('react');
    
    expect(core.value.activateFramework).toHaveBeenCalledWith('react');
  });

  it('should get components and adapters', () => {
    wrapper = mount(TestComponent);
    const { getComponent, getAdapter, core } = wrapper.vm.$options.setup();
    
    getComponent('Button');
    expect(core.value.getComponent).toHaveBeenCalledWith('Button');
    
    getAdapter('state');
    expect(core.value.getAdapter).toHaveBeenCalledWith('state');
  });

  it('should call hooks', () => {
    wrapper = mount(TestComponent);
    const { callHook, core } = wrapper.vm.$options.setup();
    
    callHook('beforeMount', { data: 'test' });
    
    expect(core.value.callHook).toHaveBeenCalledWith('beforeMount', { data: 'test' });
  });
});