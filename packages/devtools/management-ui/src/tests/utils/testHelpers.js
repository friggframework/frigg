/**
 * Test Helper Utilities
 * Common utilities for testing React components
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import ThemeProvider from '../../presentation/components/theme/ThemeProvider'

// Wrapper component for tests that need theme context
export const ThemeWrapper = ({ children, defaultTheme = 'light' }) => (
  <ThemeProvider defaultTheme={defaultTheme} storageKey="test-theme">
    {children}
  </ThemeProvider>
)

// Custom render function with theme provider
export const renderWithTheme = (component, options = {}) => {
  const { defaultTheme = 'light', ...renderOptions } = options

  return render(
    <ThemeWrapper defaultTheme={defaultTheme}>
      {component}
    </ThemeWrapper>,
    renderOptions
  )
}

// Helper to simulate localStorage operations
export const mockLocalStorage = () => {
  const store = new Map()

  return {
    getItem: vi.fn((key) => store.get(key) || null),
    setItem: vi.fn((key, value) => store.set(key, value)),
    removeItem: vi.fn((key) => store.delete(key)),
    clear: vi.fn(() => store.clear()),
    get store() { return Object.fromEntries(store) }
  }
}

// Helper to simulate system color scheme preference
export const mockSystemColorScheme = (isDark = false) => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => {
      const matches = query.includes('prefers-color-scheme: dark') ? isDark : !isDark
      return {
        matches,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }
    }),
  })
}

// Helper to assert theme classes on document element
export const expectThemeClass = (theme) => {
  const root = document.documentElement
  if (theme === 'system') {
    // System theme should apply either light or dark based on system preference
    expect(root.classList.contains('light') || root.classList.contains('dark')).toBe(true)
  } else {
    expect(root.classList.contains(theme)).toBe(true)
    // Ensure other theme classes are removed
    const otherThemes = ['light', 'dark'].filter(t => t !== theme)
    otherThemes.forEach(t => expect(root.classList.contains(t)).toBe(false))
  }
}

// Helper to simulate user interactions with proper timing
export const userInteraction = {
  click: async (element) => {
    const user = userEvent.setup()
    await user.click(element)
  },

  type: async (element, text) => {
    const user = userEvent.setup()
    await user.type(element, text)
  },

  keyboard: async (keys) => {
    const user = userEvent.setup()
    await user.keyboard(keys)
  },

  hover: async (element) => {
    const user = userEvent.setup()
    await user.hover(element)
  }
}

// Helper to wait for API calls to complete
export const waitForAPICall = async (mock, callCount = 1) => {
  await waitFor(() => {
    expect(mock).toHaveBeenCalledTimes(callCount)
  })
}

// Helper to simulate network delays
export const simulateNetworkDelay = (ms = 100) => {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Helper to test accessibility features
export const testAccessibility = {
  keyboardNavigation: async (element, key = 'Enter') => {
    element.focus()
    await userInteraction.keyboard(key)
  },

  screenReaderText: (text) => {
    expect(screen.getByLabelText(text) || screen.getByText(text)).toBeInTheDocument()
  },

  focusManagement: (expectedElement) => {
    expect(document.activeElement).toBe(expectedElement)
  }
}

// Helper to test error boundaries
export const triggerError = (component, error = new Error('Test error')) => {
  // Temporarily suppress console.error for cleaner test output
  const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  // Trigger error in component
  const ErrorComponent = () => {
    throw error
  }

  return {
    cleanup: () => consoleSpy.mockRestore()
  }
}

// Helper to create custom events
export const createCustomEvent = (type, detail = {}) => {
  return new CustomEvent(type, { detail })
}

// Helper to test modal behavior
export const testModal = {
  expectOpen: (modalElement) => {
    expect(modalElement).toBeInTheDocument()
    expect(modalElement).toBeVisible()
  },

  expectClosed: (modalElement) => {
    expect(modalElement).not.toBeInTheDocument()
  },

  clickBackdrop: async (container) => {
    const backdrop = container.querySelector('[data-testid="modal-backdrop"]') ||
                    container.querySelector('.fixed.inset-0')
    if (backdrop) {
      await userInteraction.click(backdrop)
    }
  },

  pressEscape: async () => {
    await userInteraction.keyboard('{Escape}')
  }
}

// Performance testing helpers
export const measurePerformance = {
  renderTime: (renderFn) => {
    const start = performance.now()
    const result = renderFn()
    const end = performance.now()
    return {
      result,
      time: end - start
    }
  },

  expectFastRender: (time, threshold = 100) => {
    expect(time).toBeLessThan(threshold)
  }
}

// Security testing helpers
export const securityTest = {
  xssPayloads: [
    '<script>alert("xss")</script>',
    'javascript:alert("xss")',
    'onload="alert(\'xss\')"',
    '"><script>alert("xss")</script>',
    '\';alert(String.fromCharCode(88,83,83))//\';alert(String.fromCharCode(88,83,83))//";alert(String.fromCharCode(88,83,83))//";alert(String.fromCharCode(88,83,83))//--></SCRIPT>">\'><SCRIPT>alert(String.fromCharCode(88,83,83))</SCRIPT>'
  ],

  pathTraversalPayloads: [
    '../../../etc/passwd',
    '..\\..\\..\\windows\\system32',
    '/etc/passwd',
    'C:\\Windows\\System32\\',
    '....//....//....//etc/passwd',
    '..%2F..%2F..%2Fetc%2Fpasswd'
  ],

  commandInjectionPayloads: [
    '; rm -rf /',
    '&& cat /etc/passwd',
    '| ls -la',
    '`whoami`',
    '$(whoami)',
    '\n/bin/sh\n'
  ]
}

export default {
  renderWithTheme,
  mockLocalStorage,
  mockSystemColorScheme,
  expectThemeClass,
  userInteraction,
  waitForAPICall,
  simulateNetworkDelay,
  testAccessibility,
  triggerError,
  testModal,
  measurePerformance,
  securityTest
}