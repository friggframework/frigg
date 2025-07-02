import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { useToast } from '../../composables/useToast';

// Mock the toast manager
const mockToastManager = {
  showToast: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
  promise: vi.fn(),
  custom: vi.fn(),
  dismiss: vi.fn(),
  clearAll: vi.fn(),
  getToasts: vi.fn(() => []),
  setDefaultOptions: vi.fn()
};

// Mock ui-core
vi.mock('@friggframework/ui-core', () => ({
  friggUICore: {
    getToastManager: vi.fn(() => mockToastManager)
  }
}));

describe('useToast', () => {
  let wrapper;
  
  const TestComponent = defineComponent({
    setup() {
      return useToast();
    },
    template: '<div>Test</div>'
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should provide all toast methods', () => {
    wrapper = mount(TestComponent);
    const result = wrapper.vm.$options.setup();
    
    expect(result.showToast).toBeDefined();
    expect(result.success).toBeDefined();
    expect(result.error).toBeDefined();
    expect(result.warning).toBeDefined();
    expect(result.info).toBeDefined();
    expect(result.promise).toBeDefined();
    expect(result.custom).toBeDefined();
    expect(result.dismiss).toBeDefined();
    expect(result.clearAll).toBeDefined();
  });

  it('should provide reactive toasts state', () => {
    wrapper = mount(TestComponent);
    const { toasts, activeToasts, hasActiveToasts } = wrapper.vm.$options.setup();
    
    expect(toasts.value).toEqual([]);
    expect(activeToasts.value).toEqual([]);
    expect(hasActiveToasts.value).toBe(false);
  });

  it('should show success toast', () => {
    wrapper = mount(TestComponent);
    const { success } = wrapper.vm.$options.setup();
    
    success('Operation successful!');
    
    expect(mockToastManager.success).toHaveBeenCalledWith('Operation successful!', undefined);
  });

  it('should show error toast with options', () => {
    wrapper = mount(TestComponent);
    const { error } = wrapper.vm.$options.setup();
    
    const options = { duration: 5000 };
    error('Something went wrong!', options);
    
    expect(mockToastManager.error).toHaveBeenCalledWith('Something went wrong!', options);
  });

  it('should show warning toast', () => {
    wrapper = mount(TestComponent);
    const { warning } = wrapper.vm.$options.setup();
    
    warning('Be careful!');
    
    expect(mockToastManager.warning).toHaveBeenCalledWith('Be careful!', undefined);
  });

  it('should show info toast', () => {
    wrapper = mount(TestComponent);
    const { info } = wrapper.vm.$options.setup();
    
    info('Just so you know...');
    
    expect(mockToastManager.info).toHaveBeenCalledWith('Just so you know...', undefined);
  });

  it('should handle promise toast', async () => {
    wrapper = mount(TestComponent);
    const { promise } = wrapper.vm.$options.setup();
    
    const mockPromise = Promise.resolve('Success');
    const messages = {
      loading: 'Loading...',
      success: 'Done!',
      error: 'Failed!'
    };
    
    promise(mockPromise, messages);
    
    expect(mockToastManager.promise).toHaveBeenCalledWith(mockPromise, messages, undefined);
  });

  it('should show custom toast', () => {
    wrapper = mount(TestComponent);
    const { custom } = wrapper.vm.$options.setup();
    
    const content = { title: 'Custom', description: 'Custom toast' };
    const options = { position: 'top-center' };
    
    custom(content, options);
    
    expect(mockToastManager.custom).toHaveBeenCalledWith(content, options);
  });

  it('should dismiss specific toast', () => {
    wrapper = mount(TestComponent);
    const { dismiss } = wrapper.vm.$options.setup();
    
    dismiss('toast-123');
    
    expect(mockToastManager.dismiss).toHaveBeenCalledWith('toast-123');
  });

  it('should clear all toasts', () => {
    wrapper = mount(TestComponent);
    const { clearAll } = wrapper.vm.$options.setup();
    
    clearAll();
    
    expect(mockToastManager.clearAll).toHaveBeenCalled();
  });

  it('should set default options', () => {
    wrapper = mount(TestComponent);
    const { setDefaultOptions } = wrapper.vm.$options.setup();
    
    const defaultOptions = { duration: 3000, position: 'bottom-right' };
    setDefaultOptions(defaultOptions);
    
    expect(mockToastManager.setDefaultOptions).toHaveBeenCalledWith(defaultOptions);
  });

  it('should update toasts when manager state changes', async () => {
    mockToastManager.getToasts.mockReturnValueOnce([
      { id: '1', message: 'Toast 1', type: 'success' },
      { id: '2', message: 'Toast 2', type: 'error' }
    ]);

    wrapper = mount(TestComponent);
    const { updateToasts, toasts, activeToasts, hasActiveToasts } = wrapper.vm.$options.setup();
    
    updateToasts();
    await wrapper.vm.$nextTick();
    
    expect(toasts.value).toHaveLength(2);
    expect(activeToasts.value).toHaveLength(2);
    expect(hasActiveToasts.value).toBe(true);
  });

  it('should handle errors gracefully', () => {
    const { friggUICore } = require('@friggframework/ui-core');
    friggUICore.getToastManager.mockReturnValueOnce(null);

    wrapper = mount(TestComponent);
    const { success } = wrapper.vm.$options.setup();
    
    // Should not throw when manager is null
    expect(() => success('Test')).not.toThrow();
  });
});