import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

// Mock ui-core
vi.mock('@friggframework/ui-core', () => ({
  friggUICore: {
    getToastManager: () => ({
      getState: () => ({ toasts: [] }),
      subscribe: vi.fn((callback) => {
        // Return unsubscribe function
        return () => {};
      }),
      toast: vi.fn((props) => `toast-${Date.now()}`),
      dismiss: vi.fn(),
      dismissAll: vi.fn(),
      clear: vi.fn()
    })
  }
}));

// Import after mocking
import { toastStore, toastCount, activeToasts } from '../../stores/toast.js';

describe('Toast Store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with empty toasts', () => {
    const toasts = get(toastStore);
    expect(toasts).toEqual([]);
  });

  it('should have toast creation methods', () => {
    expect(toastStore.toast).toBeDefined();
    expect(toastStore.success).toBeDefined();
    expect(toastStore.error).toBeDefined();
    expect(toastStore.warning).toBeDefined();
    expect(toastStore.info).toBeDefined();
  });

  it('should have toast management methods', () => {
    expect(toastStore.dismiss).toBeDefined();
    expect(toastStore.dismissAll).toBeDefined();
    expect(toastStore.clear).toBeDefined();
    expect(toastStore.destroy).toBeDefined();
  });

  it('should create success toast with correct props', () => {
    const toastId = toastStore.success('Operation successful');
    expect(toastId).toMatch(/^toast-/);
  });

  it('should create error toast with correct props', () => {
    const toastId = toastStore.error('Something went wrong');
    expect(toastId).toMatch(/^toast-/);
  });

  it('should create warning toast with correct props', () => {
    const toastId = toastStore.warning('Be careful');
    expect(toastId).toMatch(/^toast-/);
  });

  it('should create info toast with correct props', () => {
    const toastId = toastStore.info('For your information');
    expect(toastId).toMatch(/^toast-/);
  });

  it('should create toast with custom options', () => {
    const toastId = toastStore.toast({
      title: 'Custom Toast',
      description: 'With custom options',
      variant: 'default',
      duration: 5000
    });
    expect(toastId).toMatch(/^toast-/);
  });
});

describe('Toast Derived Stores', () => {
  it('should provide toast count', () => {
    const count = get(toastCount);
    expect(typeof count).toBe('number');
    expect(count).toBe(0);
  });

  it('should provide active toasts', () => {
    const active = get(activeToasts);
    expect(Array.isArray(active)).toBe(true);
    expect(active).toEqual([]);
  });
});