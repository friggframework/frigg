/**
 * Test Setup Configuration
 * Sets up testing environment with proper DOM and localStorage mocking
 */

import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock window.matchMedia for theme system tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock localStorage
const localStorageMock = (() => {
  let store = {}

  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => {
      store[key] = String(value)
    }),
    removeItem: vi.fn((key) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
    key: vi.fn((index) => Object.keys(store)[index] || null),
    get length() {
      return Object.keys(store).length
    }
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
})

// Mock sessionStorage
Object.defineProperty(window, 'sessionStorage', {
  value: localStorageMock
})

// Mock fetch for API calls
global.fetch = vi.fn()

// Mock console methods for cleaner test output
global.console = {
  ...console,
  error: vi.fn(),
  warn: vi.fn(),
  log: vi.fn(),
  info: vi.fn(),
}

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks()
  localStorageMock.clear()
  fetch.mockClear()
})

// Helper function to setup DOM element for portal modals
export const setupPortalContainer = () => {
  const portalContainer = document.createElement('div')
  portalContainer.setAttribute('id', 'portal-root')
  document.body.appendChild(portalContainer)

  return () => {
    document.body.removeChild(portalContainer)
  }
}

// Helper function to simulate user events with proper timing
export const waitForNextTick = () => new Promise(resolve => setTimeout(resolve, 0))