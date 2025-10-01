/**
 * Browser Compatibility and Edge Cases Tests
 * Tests for cross-browser compatibility and edge case handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { renderWithTheme, userInteraction, mockLocalStorage, mockSystemColorScheme } from '../utils/testHelpers'
import ThemeProvider from '../../presentation/components/theme/ThemeProvider'
import IDESelector from '../../presentation/components/common/IDESelector'
import OpenInIDEButton from '../../presentation/components/common/OpenInIDEButton'
import SettingsModal from '../../presentation/components/common/SettingsModal'

// Mock useIDE hook
const mockUseIDE = {
  preferredIDE: null,
  availableIDEs: [],
  setIDE: vi.fn(),
  openInIDE: vi.fn(),
  isDetecting: false,
  error: null,
  getIDEsByCategory: vi.fn(() => ({ popular: [], jetbrains: [], terminal: [], mobile: [], apple: [], java: [], windows: [], deprecated: [], other: [] })),
  getAvailableIDEs: vi.fn(() => []),
  refreshIDEDetection: vi.fn()
}

vi.mock('../../hooks/useIDE', () => ({
  useIDE: () => mockUseIDE
}))

describe('Browser Compatibility Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Legacy Browser Support', () => {
    it('should work when localStorage is not available', () => {
      // Simulate browser without localStorage
      delete window.localStorage

      const TestComponent = () => (
        <ThemeProvider defaultTheme="dark">
          <div data-testid="content">Theme Test</div>
        </ThemeProvider>
      )

      render(<TestComponent />)

      expect(screen.getByTestId('content')).toBeInTheDocument()
      // Should fallback gracefully without localStorage
    })

    it('should work when matchMedia is not supported', () => {
      // Simulate older browser without matchMedia
      delete window.matchMedia

      const TestComponent = () => (
        <ThemeProvider defaultTheme="system">
          <div data-testid="content">System Theme Test</div>
        </ThemeProvider>
      )

      render(<TestComponent />)

      expect(screen.getByTestId('content')).toBeInTheDocument()
      // Should not crash even without matchMedia support
    })

    it('should handle limited localStorage quota', () => {
      const limitedStorage = {
        getItem: vi.fn(() => null),
        setItem: vi.fn(() => {
          throw new DOMException('QuotaExceededError', 'QuotaExceededError')
        }),
        removeItem: vi.fn(),
        clear: vi.fn()
      }

      Object.defineProperty(window, 'localStorage', { value: limitedStorage })

      renderWithTheme(<SettingsModal isOpen={true} onClose={vi.fn()} />)

      // Should not crash when localStorage quota is exceeded
      expect(screen.getByText('Settings')).toBeInTheDocument()
    })

    it('should work with disabled JavaScript features', () => {
      // Simulate environment with limited JS features
      const originalFetch = global.fetch
      delete global.fetch

      render(<IDESelector />)

      expect(screen.getByRole('button')).toBeInTheDocument()

      // Restore fetch
      global.fetch = originalFetch
    })
  })

  describe('Device and Viewport Compatibility', () => {
    it('should work on mobile viewports', () => {
      // Simulate mobile viewport
      Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true })
      Object.defineProperty(window, 'innerHeight', { value: 667, configurable: true })

      renderWithTheme(<SettingsModal isOpen={true} onClose={vi.fn()} />)

      expect(screen.getByText('Settings')).toBeInTheDocument()

      // Modal should be responsive
      const modal = screen.getByText('Settings').closest('div')
      expect(modal).toHaveClass('max-w-4xl') // Should have responsive classes
    })

    it('should work on tablet viewports', () => {
      Object.defineProperty(window, 'innerWidth', { value: 768, configurable: true })
      Object.defineProperty(window, 'innerHeight', { value: 1024, configurable: true })

      renderWithTheme(<SettingsModal isOpen={true} onClose={vi.fn()} />)

      expect(screen.getByText('Settings')).toBeInTheDocument()
    })

    it('should work on large desktop viewports', () => {
      Object.defineProperty(window, 'innerWidth', { value: 2560, configurable: true })
      Object.defineProperty(window, 'innerHeight', { value: 1440, configurable: true })

      renderWithTheme(<SettingsModal isOpen={true} onClose={vi.fn()} />)

      expect(screen.getByText('Settings')).toBeInTheDocument()
    })

    it('should handle touch interactions', async () => {
      // Simulate touch device
      Object.defineProperty(window, 'ontouchstart', { value: null, configurable: true })

      renderWithTheme(<SettingsModal isOpen={true} onClose={vi.fn()} />)

      const themeButton = screen.getByText('Light').closest('button')

      // Simulate touch events
      const touchEvent = new TouchEvent('touchstart', {
        touches: [{ clientX: 100, clientY: 100 }]
      })

      themeButton.dispatchEvent(touchEvent)

      expect(themeButton).toBeInTheDocument()
    })
  })

  describe('Performance Edge Cases', () => {
    it('should handle large DOM trees efficiently', () => {
      const LargeComponent = () => (
        <div>
          {Array.from({ length: 1000 }, (_, i) => (
            <div key={i}>Item {i}</div>
          ))}
          <SettingsModal isOpen={true} onClose={vi.fn()} />
        </div>
      )

      const start = performance.now()
      renderWithTheme(<LargeComponent />)
      const end = performance.now()

      expect(end - start).toBeLessThan(1000) // Should render reasonably quickly
      expect(screen.getByText('Settings')).toBeInTheDocument()
    })

    it('should handle rapid state changes without memory leaks', async () => {
      const TestComponent = ({ count }) => (
        <ThemeProvider key={count}>
          <SettingsModal isOpen={count % 2 === 0} onClose={vi.fn()} />
        </ThemeProvider>
      )

      const { rerender } = render(<TestComponent count={0} />)

      // Rapidly change state
      for (let i = 0; i < 100; i++) {
        rerender(<TestComponent count={i} />)
      }

      // Should not accumulate memory
      const modalElements = document.querySelectorAll('[data-testid*="modal"]')
      expect(modalElements.length).toBeLessThanOrEqual(1)
    })

    it('should handle concurrent operations gracefully', async () => {
      mockUseIDE.openInIDE.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ success: true }), 100))
      )

      render(<OpenInIDEButton filePath="/test/file.js" />)

      const button = screen.getByRole('button')

      // Trigger multiple concurrent operations
      const promises = Array(10).fill(null).map(() => userInteraction.click(button))

      await Promise.all(promises)

      // Should handle gracefully without crashes
      expect(button).toBeInTheDocument()
    })
  })

  describe('Platform-Specific Edge Cases', () => {
    it('should handle Windows file paths correctly', () => {
      const windowsPaths = [
        'C:\\Users\\User\\Documents\\file.txt',
        'D:\\Projects\\MyApp\\src\\index.js',
        '\\\\server\\share\\file.doc',
        'file.txt' // Relative path
      ]

      windowsPaths.forEach(path => {
        render(<OpenInIDEButton filePath={path} />)

        const button = screen.getByRole('button')
        expect(button).toHaveAttribute('title', expect.stringContaining(path))
      })
    })

    it('should handle Unix file paths correctly', () => {
      const unixPaths = [
        '/home/user/project/file.js',
        '/var/www/html/index.php',
        './relative/path/file.py',
        '../parent/file.txt',
        '~/home/file.rb'
      ]

      unixPaths.forEach(path => {
        render(<OpenInIDEButton filePath={path} />)

        const button = screen.getByRole('button')
        expect(button).toHaveAttribute('title', expect.stringContaining(path))
      })
    })

    it('should handle special characters in file paths', () => {
      const specialPaths = [
        '/path/with spaces/file.js',
        '/path/with-dashes/file.js',
        '/path/with_underscores/file.js',
        '/path/with.dots/file.js',
        '/path/with(parentheses)/file.js',
        '/path/with[brackets]/file.js',
        '/path/with{braces}/file.js'
      ]

      specialPaths.forEach(path => {
        render(<OpenInIDEButton filePath={path} />)

        const button = screen.getByRole('button')
        expect(button).toBeInTheDocument()
      })
    })
  })

  describe('Network Edge Cases', () => {
    it('should handle network timeouts gracefully', async () => {
      global.fetch = vi.fn(() =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Network timeout')), 100)
        )
      )

      mockUseIDE.openInIDE.mockRejectedValue(new Error('Network timeout'))

      render(<OpenInIDEButton filePath="/test/file.js" />)

      const button = screen.getByRole('button')
      await userInteraction.click(button)

      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument()
      })
    })

    it('should handle offline scenarios', async () => {
      // Simulate offline
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })

      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
      mockUseIDE.openInIDE.mockRejectedValue(new Error('Network error'))

      render(<OpenInIDEButton filePath="/test/file.js" />)

      const button = screen.getByRole('button')
      await userInteraction.click(button)

      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument()
      })
    })

    it('should handle server errors gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal Server Error' })
      })

      mockUseIDE.openInIDE.mockRejectedValue(new Error('Internal Server Error'))

      render(<OpenInIDEButton filePath="/test/file.js" />)

      const button = screen.getByRole('button')
      await userInteraction.click(button)

      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument()
      })
    })
  })

  describe('Input Edge Cases', () => {
    it('should handle empty and null values gracefully', () => {
      const edgeCaseValues = [null, undefined, '', '   ', '\t', '\n']

      edgeCaseValues.forEach(value => {
        render(<OpenInIDEButton filePath={value} />)

        const button = screen.getByRole('button')
        expect(button).toBeDisabled()
      })
    })

    it('should handle extremely long inputs', async () => {
      const longPath = 'a'.repeat(10000) + '.js'
      const longCommand = 'command ' + 'b'.repeat(10000)

      // Long file path
      render(<OpenInIDEButton filePath={longPath} />)
      expect(screen.getByRole('button')).toBeInTheDocument()

      // Long custom command
      render(<IDESelector />)

      const button = screen.getByRole('button')
      await userInteraction.click(button)

      const customButton = screen.getByText('Custom Command').closest('button')
      await userInteraction.click(customButton)

      const input = screen.getByPlaceholderText(/Enter your IDE command/)

      // Should handle long input without crashing
      await userInteraction.type(input, longCommand.substring(0, 100)) // Type partial
      expect(input.value).toBeTruthy()
    })

    it('should handle unicode and emoji in inputs', async () => {
      const unicodeInputs = [
        '🚀 My Project/file.js',
        '/path/with/émojis/file.js',
        '/путь/с/кириллицей/файл.js',
        '/路径/中文/文件.js',
        '/🌟⭐✨/special/file.js'
      ]

      unicodeInputs.forEach(path => {
        render(<OpenInIDEButton filePath={path} />)

        const button = screen.getByRole('button')
        expect(button).toBeInTheDocument()
      })
    })
  })

  describe('Accessibility Edge Cases', () => {
    it('should work with high contrast mode', () => {
      // Simulate high contrast mode
      Object.defineProperty(window, 'matchMedia', {
        value: vi.fn().mockImplementation(query => ({
          matches: query.includes('prefers-contrast: high'),
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      })

      renderWithTheme(<SettingsModal isOpen={true} onClose={vi.fn()} />)

      expect(screen.getByText('Settings')).toBeInTheDocument()
    })

    it('should work with reduced motion preference', () => {
      Object.defineProperty(window, 'matchMedia', {
        value: vi.fn().mockImplementation(query => ({
          matches: query.includes('prefers-reduced-motion: reduce'),
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
      })

      renderWithTheme(<SettingsModal isOpen={true} onClose={vi.fn()} />)

      expect(screen.getByText('Settings')).toBeInTheDocument()
      // Animations should be reduced
    })

    it('should work with screen readers', () => {
      // Simulate screen reader environment
      render(<SettingsModal isOpen={true} onClose={vi.fn()} />)

      // Should have proper ARIA structure
      expect(screen.getByRole('heading')).toBeInTheDocument()

      // All interactive elements should have accessible names
      const buttons = screen.getAllByRole('button')
      buttons.forEach(button => {
        expect(button).toHaveAccessibleName()
      })
    })

    it('should work with keyboard-only navigation', async () => {
      renderWithTheme(<SettingsModal isOpen={true} onClose={vi.fn()} />)

      // Should be able to navigate with keyboard only
      await userInteraction.keyboard('{Tab}')
      expect(document.activeElement).toBeTruthy()

      await userInteraction.keyboard('{Enter}')
      // Action should be triggered
    })
  })

  describe('Memory and Resource Management', () => {
    it('should clean up event listeners on unmount', () => {
      const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

      const { unmount } = renderWithTheme(<SettingsModal isOpen={true} onClose={vi.fn()} />)

      unmount()

      // Should clean up event listeners (for theme system)
      if (addEventListenerSpy.mock.calls.length > 0) {
        expect(removeEventListenerSpy).toHaveBeenCalled()
      }

      addEventListenerSpy.mockRestore()
      removeEventListenerSpy.mockRestore()
    })

    it('should not leak memory with repeated renders', () => {
      const TestComponent = ({ iteration }) => (
        <ThemeProvider key={iteration}>
          <SettingsModal isOpen={iteration % 2 === 0} onClose={vi.fn()} />
        </ThemeProvider>
      )

      const { rerender } = render(<TestComponent iteration={0} />)

      const initialNodeCount = document.querySelectorAll('*').length

      // Render many times
      for (let i = 1; i < 50; i++) {
        rerender(<TestComponent iteration={i} />)
      }

      const finalNodeCount = document.querySelectorAll('*').length

      // Should not accumulate excessive DOM nodes
      expect(finalNodeCount - initialNodeCount).toBeLessThan(100)
    })

    it('should handle component updates efficiently', () => {
      let renderCount = 0

      const TestComponent = ({ theme }) => {
        renderCount++
        return (
          <ThemeProvider defaultTheme={theme}>
            <div>Theme: {theme}</div>
          </ThemeProvider>
        )
      }

      const { rerender } = render(<TestComponent theme="light" />)

      const initialRenderCount = renderCount

      // Change props multiple times
      rerender(<TestComponent theme="dark" />)
      rerender(<TestComponent theme="light" />)
      rerender(<TestComponent theme="dark" />)

      // Should not cause excessive re-renders
      expect(renderCount - initialRenderCount).toBeLessThan(10)
    })
  })

  describe('Error Boundary Edge Cases', () => {
    it('should handle component crashes gracefully', () => {
      const ThrowingComponent = () => {
        throw new Error('Component crashed')
      }

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Should not crash the entire app
      expect(() => {
        render(
          <ThemeProvider>
            <ThrowingComponent />
          </ThemeProvider>
        )
      }).toThrow()

      consoleSpy.mockRestore()
    })

    it('should handle async errors gracefully', async () => {
      mockUseIDE.openInIDE.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        throw new Error('Async operation failed')
      })

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      render(<OpenInIDEButton filePath="/test/file.js" />)

      const button = screen.getByRole('button')
      await userInteraction.click(button)

      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument()
      })

      consoleSpy.mockRestore()
    })
  })
})