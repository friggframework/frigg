// Test setup for ui-core
import { beforeEach } from 'vitest';

// Mock localStorage
Object.defineProperty(window, 'localStorage', {
  value: {
    store: {},
    getItem(key) {
      return this.store[key] || null;
    },
    setItem(key, value) {
      this.store[key] = String(value);
    },
    removeItem(key) {
      delete this.store[key];
    },
    clear() {
      this.store = {};
    }
  },
  writable: true
});

// Mock fetch
global.fetch = vi.fn();

// Clear mocks before each test
beforeEach(() => {
  localStorage.clear();
  fetch.mockClear();
});