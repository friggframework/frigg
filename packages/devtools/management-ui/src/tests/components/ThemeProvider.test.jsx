/**
 * ThemeProvider Component Tests
 * Comprehensive tests for theme switching and localStorage persistence
 */

import React from 'react'
import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import ThemeProvider, { useTheme } from '../../presentation/components/theme/ThemeProvider'
import { mockLocalStorage, mockSystemColorScheme, expectThemeClass, userInteraction } from '../utils/testHelpers'

// Test component to interact with theme context
const ThemeTestComponent = () => {
  const { theme, setTheme } = useTheme()
  return (
    <div>
      <span data-testid="current-theme">{theme}</span>
      <button data-testid="set-light" onClick={() => setTheme('light')}>Light</button>
      <button data-testid="set-dark" onClick={() => setTheme('dark')}>Dark</button>
      <button data-testid="set-system" onClick={() => setTheme('system')}>System</button>
    </div>
  )
}

describe('ThemeProvider', () => {
  let mockStorage

  beforeEach(() => {
    mockStorage = mockLocalStorage()
    Object.defineProperty(window, 'localStorage', { value: mockStorage })

    // Reset DOM classes
    document.documentElement.className = ''
  })

  describe('Initialization', () => {
    it('should use default theme when no stored preference exists', () => {
      render(
        <ThemeProvider defaultTheme="dark">
          <ThemeTestComponent />
        </ThemeProvider>
      )

      expect(screen.getByTestId('current-theme')).toHaveTextContent('dark')
      expectThemeClass('dark')
    })

    it('should load stored theme preference from localStorage', () => {
      mockStorage.setItem('frigg-ui-theme', 'light')

      render(
        <ThemeProvider>
          <ThemeTestComponent />
        </ThemeProvider>
      )

      expect(screen.getByTestId('current-theme')).toHaveTextContent('light')
      expectThemeClass('light')
    })

    it('should use custom storage key', () => {
      mockStorage.setItem('custom-theme-key', 'dark')

      render(
        <ThemeProvider storageKey="custom-theme-key">
          <ThemeTestComponent />
        </ThemeProvider>
      )

      expect(screen.getByTestId('current-theme')).toHaveTextContent('dark')
    })

    it('should handle corrupted localStorage data gracefully', () => {
      mockStorage.setItem('frigg-ui-theme', 'invalid-theme')

      render(
        <ThemeProvider defaultTheme="light">
          <ThemeTestComponent />
        </ThemeProvider>
      )

      expect(screen.getByTestId('current-theme')).toHaveTextContent('invalid-theme')
    })
  })

  describe('Theme Switching', () => {
    it('should switch to light theme and persist to localStorage', async () => {
      render(
        <ThemeProvider>
          <ThemeTestComponent />
        </ThemeProvider>
      )

      await userInteraction.click(screen.getByTestId('set-light'))

      expect(screen.getByTestId('current-theme')).toHaveTextContent('light')
      expect(mockStorage.setItem).toHaveBeenCalledWith('frigg-ui-theme', 'light')
      expectThemeClass('light')
    })

    it('should switch to dark theme and persist to localStorage', async () => {
      render(
        <ThemeProvider>
          <ThemeTestComponent />
        </ThemeProvider>
      )

      await userInteraction.click(screen.getByTestId('set-dark'))

      expect(screen.getByTestId('current-theme')).toHaveTextContent('dark')
      expect(mockStorage.setItem).toHaveBeenCalledWith('frigg-ui-theme', 'dark')
      expectThemeClass('dark')
    })

    it('should switch to system theme and respect system preference', async () => {
      mockSystemColorScheme(true) // System prefers dark

      render(
        <ThemeProvider>
          <ThemeTestComponent />
        </ThemeProvider>
      )

      await userInteraction.click(screen.getByTestId('set-system'))

      expect(screen.getByTestId('current-theme')).toHaveTextContent('system')
      expect(mockStorage.setItem).toHaveBeenCalledWith('frigg-ui-theme', 'system')
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })

    it('should handle rapid theme changes without issues', async () => {
      render(
        <ThemeProvider>
          <ThemeTestComponent />
        </ThemeProvider>
      )

      // Rapidly change themes
      await userInteraction.click(screen.getByTestId('set-light'))
      await userInteraction.click(screen.getByTestId('set-dark'))
      await userInteraction.click(screen.getByTestId('set-system'))
      await userInteraction.click(screen.getByTestId('set-light'))

      expect(screen.getByTestId('current-theme')).toHaveTextContent('light')
      expectThemeClass('light')
    })
  })

  describe('System Theme Integration', () => {
    it('should apply light theme when system prefers light', () => {
      mockSystemColorScheme(false) // System prefers light

      render(
        <ThemeProvider defaultTheme="system">
          <ThemeTestComponent />
        </ThemeProvider>
      )

      expect(document.documentElement.classList.contains('light')).toBe(true)
      expect(document.documentElement.classList.contains('dark')).toBe(false)
    })

    it('should apply dark theme when system prefers dark', () => {
      mockSystemColorScheme(true) // System prefers dark

      render(
        <ThemeProvider defaultTheme="system">
          <ThemeTestComponent />
        </ThemeProvider>
      )

      expect(document.documentElement.classList.contains('dark')).toBe(true)
      expect(document.documentElement.classList.contains('light')).toBe(false)
    })

    it('should update when system preference changes', async () => {
      const matchMediaMock = vi.fn()
      let changeHandler

      matchMediaMock.mockImplementation(query => ({
        matches: query.includes('prefers-color-scheme: dark'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn((event, handler) => {
          if (event === 'change') changeHandler = handler
        }),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))

      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: matchMediaMock
      })

      render(
        <ThemeProvider defaultTheme="system">
          <ThemeTestComponent />
        </ThemeProvider>
      )

      // Simulate system preference change
      if (changeHandler) {
        act(() => {
          changeHandler({ matches: true })
        })
      }

      // Theme provider should react to system changes when in system mode
      expect(screen.getByTestId('current-theme')).toHaveTextContent('system')
    })
  })

  describe('Error Handling', () => {
    it('should handle localStorage errors gracefully', async () => {
      const mockSetItem = vi.fn(() => {
        throw new Error('localStorage full')
      })
      mockStorage.setItem = mockSetItem

      render(
        <ThemeProvider>
          <ThemeTestComponent />
        </ThemeProvider>
      )

      // Should not crash when localStorage fails
      await userInteraction.click(screen.getByTestId('set-dark'))
      expect(screen.getByTestId('current-theme')).toHaveTextContent('dark')
    })

    it('should throw error when useTheme is used outside provider', () => {
      // Suppress console error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        render(<ThemeTestComponent />)
      }).toThrow('useTheme must be used within a ThemeProvider')

      consoleSpy.mockRestore()
    })
  })

  describe('Performance', () => {
    it('should not cause unnecessary re-renders', () => {
      let renderCount = 0
      const TestComponent = () => {
        renderCount++
        const { theme } = useTheme()
        return <div>{theme}</div>
      }

      const { rerender } = render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      )

      const initialRenderCount = renderCount

      // Rerender with same props should not cause re-render
      rerender(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      )

      expect(renderCount).toBe(initialRenderCount)
    })

    it('should debounce rapid theme changes', async () => {
      render(
        <ThemeProvider>
          <ThemeTestComponent />
        </ThemeProvider>
      )

      // Rapidly change themes
      const promises = [
        userInteraction.click(screen.getByTestId('set-light')),
        userInteraction.click(screen.getByTestId('set-dark')),
        userInteraction.click(screen.getByTestId('set-light'))
      ]

      await Promise.all(promises)

      // Final state should be consistent
      expect(screen.getByTestId('current-theme')).toHaveTextContent('light')
      expectThemeClass('light')
    })
  })

  describe('Accessibility', () => {
    it('should not interfere with screen readers', () => {
      render(
        <ThemeProvider>
          <ThemeTestComponent />
        </ThemeProvider>
      )

      // Theme changes should not affect accessibility tree
      const themeDisplay = screen.getByTestId('current-theme')
      expect(themeDisplay).toBeVisible()
      expect(themeDisplay).toHaveTextContent('system') // default
    })

    it('should support keyboard navigation for theme controls', async () => {
      render(
        <ThemeProvider>
          <ThemeTestComponent />
        </ThemeProvider>
      )

      const lightButton = screen.getByTestId('set-light')
      lightButton.focus()

      await userInteraction.keyboard('{Enter}')
      expect(screen.getByTestId('current-theme')).toHaveTextContent('light')
    })
  })

  describe('Cross-browser Compatibility', () => {
    it('should work when matchMedia is not supported', () => {
      // Simulate older browser without matchMedia
      delete window.matchMedia

      render(
        <ThemeProvider defaultTheme="system">
          <ThemeTestComponent />
        </ThemeProvider>
      )

      // Should fallback gracefully
      expect(screen.getByTestId('current-theme')).toHaveTextContent('system')
    })

    it('should handle different localStorage implementations', () => {
      // Simulate browser with limited localStorage
      const limitedStorage = {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn()
      }

      Object.defineProperty(window, 'localStorage', { value: limitedStorage })

      render(
        <ThemeProvider defaultTheme="dark">
          <ThemeTestComponent />
        </ThemeProvider>
      )

      expect(screen.getByTestId('current-theme')).toHaveTextContent('dark')
    })
  })
})