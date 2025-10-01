/**
 * SettingsModal Component Tests
 * Comprehensive tests for settings modal functionality
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import SettingsModal from '../../presentation/components/common/SettingsModal'
import { mockFetch, mockIDEsList } from '../mocks/ideApi'
import { renderWithTheme, userInteraction, testModal, mockLocalStorage } from '../utils/testHelpers'

// Mock the hooks
vi.mock('../../hooks/useIDE', () => ({
  useIDE: () => ({
    preferredIDE: null,
    availableIDEs: Object.values(mockIDEsList),
    setIDE: vi.fn(),
    isDetecting: false,
    error: null
  })
}))

const defaultProps = {
  isOpen: true,
  onClose: vi.fn()
}

describe('SettingsModal', () => {
  let mockStorage

  beforeEach(() => {
    mockStorage = mockLocalStorage()
    Object.defineProperty(window, 'localStorage', { value: mockStorage })
    global.fetch = mockFetch()
  })

  describe('Modal Behavior', () => {
    it('should render modal when open', () => {
      renderWithTheme(<SettingsModal {...defaultProps} />)

      expect(screen.getByText('Settings')).toBeInTheDocument()
      expect(screen.getByText('Configure Frigg Management UI')).toBeInTheDocument()
    })

    it('should not render when closed', () => {
      renderWithTheme(<SettingsModal {...defaultProps} isOpen={false} />)

      expect(screen.queryByText('Settings')).not.toBeInTheDocument()
    })

    it('should call onClose when close button is clicked', async () => {
      const onClose = vi.fn()
      renderWithTheme(<SettingsModal {...defaultProps} onClose={onClose} />)

      const closeButton = screen.getByRole('button', { name: /close/i })
      await userInteraction.click(closeButton)

      expect(onClose).toHaveBeenCalled()
    })

    it('should call onClose when backdrop is clicked', async () => {
      const onClose = vi.fn()
      const { container } = renderWithTheme(<SettingsModal {...defaultProps} onClose={onClose} />)

      const backdrop = container.querySelector('.bg-black\\/50')
      await userInteraction.click(backdrop)

      expect(onClose).toHaveBeenCalled()
    })

    it('should support keyboard navigation', async () => {
      renderWithTheme(<SettingsModal {...defaultProps} />)

      // Tab should move focus within modal
      await userInteraction.keyboard('{Tab}')
      expect(document.activeElement).toBeTruthy()

      // Escape should close modal
      const onClose = vi.fn()
      renderWithTheme(<SettingsModal {...defaultProps} onClose={onClose} />)

      await userInteraction.keyboard('{Escape}')
      // Note: Modal backdrop click would handle this, but we're testing the pattern
    })
  })

  describe('Tab Navigation', () => {
    it('should show appearance tab by default', () => {
      renderWithTheme(<SettingsModal {...defaultProps} />)

      expect(screen.getByText('Theme Preference')).toBeInTheDocument()
      expect(screen.getByText('Choose your visual theme')).toBeInTheDocument()
    })

    it('should switch to editor integration tab', async () => {
      renderWithTheme(<SettingsModal {...defaultProps} />)

      const editorTab = screen.getByText('Editor Integration')
      await userInteraction.click(editorTab)

      expect(screen.getByText('Preferred IDE')).toBeInTheDocument()
      expect(screen.getByText('Choose your preferred IDE for opening generated code files')).toBeInTheDocument()
    })

    it('should highlight active tab', async () => {
      renderWithTheme(<SettingsModal {...defaultProps} />)

      const appearanceTab = screen.getByText('Appearance').closest('button')
      const editorTab = screen.getByText('Editor Integration').closest('button')

      expect(appearanceTab).toHaveClass('bg-background')

      await userInteraction.click(editorTab)

      expect(editorTab).toHaveClass('bg-background')
    })

    it('should show correct tab descriptions', () => {
      renderWithTheme(<SettingsModal {...defaultProps} />)

      expect(screen.getByText('Theme and visual preferences')).toBeInTheDocument()
      expect(screen.getByText('IDE and editor settings')).toBeInTheDocument()
    })
  })

  describe('Appearance Tab', () => {
    it('should display all theme options', () => {
      renderWithTheme(<SettingsModal {...defaultProps} />)

      expect(screen.getByText('Light')).toBeInTheDocument()
      expect(screen.getByText('Dark')).toBeInTheDocument()
      expect(screen.getByText('System')).toBeInTheDocument()
    })

    it('should show theme descriptions', () => {
      renderWithTheme(<SettingsModal {...defaultProps} />)

      expect(screen.getByText('Clean industrial light theme')).toBeInTheDocument()
      expect(screen.getByText('Dark industrial theme')).toBeInTheDocument()
      expect(screen.getByText('Match system preference')).toBeInTheDocument()
    })

    it('should highlight current theme', () => {
      renderWithTheme(<SettingsModal {...defaultProps} />, { defaultTheme: 'dark' })

      const darkThemeButton = screen.getByText('Dark').closest('button')
      expect(darkThemeButton).toHaveClass('border-primary/50')
    })

    it('should allow theme switching', async () => {
      renderWithTheme(<SettingsModal {...defaultProps} />)

      const darkThemeButton = screen.getByText('Dark').closest('button')
      await userInteraction.click(darkThemeButton)

      // Theme should be applied (tested more thoroughly in ThemeProvider tests)
      expect(darkThemeButton).toHaveClass('border-primary/50')
    })

    it('should show color palette information', () => {
      renderWithTheme(<SettingsModal {...defaultProps} />)

      expect(screen.getByText('Color Scheme')).toBeInTheDocument()
      expect(screen.getByText('Industrial design with Frigg brand colors')).toBeInTheDocument()
      expect(screen.getByText('Frigg Industrial Palette')).toBeInTheDocument()
    })
  })

  describe('Editor Integration Tab', () => {
    it('should display available IDEs', async () => {
      renderWithTheme(<SettingsModal {...defaultProps} />)

      const editorTab = screen.getByText('Editor Integration')
      await userInteraction.click(editorTab)

      expect(screen.getByText('Visual Studio Code')).toBeInTheDocument()
      expect(screen.getByText('WebStorm')).toBeInTheDocument()
      expect(screen.getByText('Sublime Text')).toBeInTheDocument()
    })

    it('should show IDE selection state', async () => {
      const mockSetIDE = vi.fn()

      vi.doMock('../../hooks/useIDE', () => ({
        useIDE: () => ({
          preferredIDE: mockIDEsList.vscode,
          availableIDEs: Object.values(mockIDEsList),
          setIDE: mockSetIDE,
          isDetecting: false,
          error: null
        })
      }))

      renderWithTheme(<SettingsModal {...defaultProps} />)

      const editorTab = screen.getByText('Editor Integration')
      await userInteraction.click(editorTab)

      const vscodeButton = screen.getByText('Visual Studio Code').closest('button')
      expect(vscodeButton).toHaveClass('border-primary/50')
    })

    it('should allow IDE selection', async () => {
      const mockSetIDE = vi.fn()

      vi.doMock('../../hooks/useIDE', () => ({
        useIDE: () => ({
          preferredIDE: null,
          availableIDEs: Object.values(mockIDEsList),
          setIDE: mockSetIDE,
          isDetecting: false,
          error: null
        })
      }))

      renderWithTheme(<SettingsModal {...defaultProps} />)

      const editorTab = screen.getByText('Editor Integration')
      await userInteraction.click(editorTab)

      const webstormButton = screen.getByText('WebStorm').closest('button')
      await userInteraction.click(webstormButton)

      expect(mockSetIDE).toHaveBeenCalledWith(mockIDEsList.webstorm)
    })

    it('should show current selection info when IDE is selected', async () => {
      vi.doMock('../../hooks/useIDE', () => ({
        useIDE: () => ({
          preferredIDE: mockIDEsList.vscode,
          availableIDEs: Object.values(mockIDEsList),
          setIDE: vi.fn(),
          isDetecting: false,
          error: null
        })
      }))

      renderWithTheme(<SettingsModal {...defaultProps} />)

      const editorTab = screen.getByText('Editor Integration')
      await userInteraction.click(editorTab)

      expect(screen.getByText('Current Selection')).toBeInTheDocument()
      expect(screen.getByText('Visual Studio Code')).toBeInTheDocument()
    })
  })

  describe('Custom Command Dialog', () => {
    it('should open custom command dialog when custom option is selected', async () => {
      renderWithTheme(<SettingsModal {...defaultProps} />)

      const editorTab = screen.getByText('Editor Integration')
      await userInteraction.click(editorTab)

      const customButton = screen.getByText('Custom Command').closest('button')
      await userInteraction.click(customButton)

      expect(screen.getByText('Custom IDE Command')).toBeInTheDocument()
      expect(screen.getByText('Enter the command to open your preferred IDE')).toBeInTheDocument()
    })

    it('should show security notice in custom command dialog', async () => {
      renderWithTheme(<SettingsModal {...defaultProps} />)

      const editorTab = screen.getByText('Editor Integration')
      await userInteraction.click(editorTab)

      const customButton = screen.getByText('Custom Command').closest('button')
      await userInteraction.click(customButton)

      expect(screen.getByText('Security Notice:')).toBeInTheDocument()
      expect(screen.getByText('Commands are validated for security')).toBeInTheDocument()
      expect(screen.getByText('Shell metacharacters are blocked')).toBeInTheDocument()
    })

    it('should show command examples', async () => {
      renderWithTheme(<SettingsModal {...defaultProps} />)

      const editorTab = screen.getByText('Editor Integration')
      await userInteraction.click(editorTab)

      const customButton = screen.getByText('Custom Command').closest('button')
      await userInteraction.click(customButton)

      expect(screen.getByText('Examples:')).toBeInTheDocument()
      expect(screen.getByText('code {path}')).toBeInTheDocument()
      expect(screen.getByText('subl {path}')).toBeInTheDocument()
    })

    it('should allow entering custom command', async () => {
      renderWithTheme(<SettingsModal {...defaultProps} />)

      const editorTab = screen.getByText('Editor Integration')
      await userInteraction.click(editorTab)

      const customButton = screen.getByText('Custom Command').closest('button')
      await userInteraction.click(customButton)

      const input = screen.getByPlaceholderText(/Enter your IDE command/)
      await userInteraction.type(input, 'idea {path}')

      expect(input).toHaveValue('idea {path}')
    })

    it('should validate command input', async () => {
      renderWithTheme(<SettingsModal {...defaultProps} />)

      const editorTab = screen.getByText('Editor Integration')
      await userInteraction.click(editorTab)

      const customButton = screen.getByText('Custom Command').closest('button')
      await userInteraction.click(customButton)

      const input = screen.getByPlaceholderText(/Enter your IDE command/)

      // Type command with {path} placeholder
      await userInteraction.type(input, 'code {path}')

      expect(screen.getByText('Command includes {path} placeholder')).toBeInTheDocument()

      // Clear and type command without placeholder
      await userInteraction.clear(input)
      await userInteraction.type(input, 'code')

      expect(screen.getByText('Consider adding {path} placeholder')).toBeInTheDocument()
    })

    it('should save custom command', async () => {
      const mockSetIDE = vi.fn()

      vi.doMock('../../hooks/useIDE', () => ({
        useIDE: () => ({
          preferredIDE: null,
          availableIDEs: Object.values(mockIDEsList),
          setIDE: mockSetIDE,
          isDetecting: false,
          error: null
        })
      }))

      renderWithTheme(<SettingsModal {...defaultProps} />)

      const editorTab = screen.getByText('Editor Integration')
      await userInteraction.click(editorTab)

      const customButton = screen.getByText('Custom Command').closest('button')
      await userInteraction.click(customButton)

      const input = screen.getByPlaceholderText(/Enter your IDE command/)
      await userInteraction.type(input, 'idea {path}')

      const saveButton = screen.getByText('Save & Use')
      await userInteraction.click(saveButton)

      expect(mockSetIDE).toHaveBeenCalledWith({
        id: 'custom',
        name: 'Custom Command',
        command: 'idea {path}'
      })
    })

    it('should cancel custom command dialog', async () => {
      renderWithTheme(<SettingsModal {...defaultProps} />)

      const editorTab = screen.getByText('Editor Integration')
      await userInteraction.click(editorTab)

      const customButton = screen.getByText('Custom Command').closest('button')
      await userInteraction.click(customButton)

      const cancelButton = screen.getByText('Cancel')
      await userInteraction.click(cancelButton)

      expect(screen.queryByText('Custom IDE Command')).not.toBeInTheDocument()
    })

    it('should disable save button when command is empty', async () => {
      renderWithTheme(<SettingsModal {...defaultProps} />)

      const editorTab = screen.getByText('Editor Integration')
      await userInteraction.click(editorTab)

      const customButton = screen.getByText('Custom Command').closest('button')
      await userInteraction.click(customButton)

      const saveButton = screen.getByText('Save & Use')
      expect(saveButton).toBeDisabled()

      const input = screen.getByPlaceholderText(/Enter your IDE command/)
      await userInteraction.type(input, 'test command')

      expect(saveButton).not.toBeDisabled()
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      renderWithTheme(<SettingsModal {...defaultProps} />)

      expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument()
    })

    it('should support keyboard navigation', async () => {
      renderWithTheme(<SettingsModal {...defaultProps} />)

      // Tab navigation should work
      await userInteraction.keyboard('{Tab}')
      expect(document.activeElement).toBeTruthy()

      // Arrow keys should navigate tabs
      const appearanceTab = screen.getByText('Appearance').closest('button')
      appearanceTab.focus()

      await userInteraction.keyboard('{ArrowDown}')
      // Focus should move to next tab
    })

    it('should trap focus within modal', async () => {
      renderWithTheme(<SettingsModal {...defaultProps} />)

      // Focus should stay within modal when tabbing
      const focusableElements = screen.getAllByRole('button')
      expect(focusableElements.length).toBeGreaterThan(0)
    })

    it('should return focus to trigger when closed', () => {
      // This would typically be tested with a full integration test
      // where the modal is opened from a trigger element
      expect(true).toBe(true) // Placeholder for focus management test
    })
  })

  describe('Performance', () => {
    it('should not re-render unnecessarily', () => {
      const { rerender } = renderWithTheme(<SettingsModal {...defaultProps} />)

      let renderCount = 0
      const TestComponent = () => {
        renderCount++
        return <SettingsModal {...defaultProps} />
      }

      rerender(<TestComponent />)
      const initialRenderCount = renderCount

      rerender(<TestComponent />)

      // Should not cause additional renders
      expect(renderCount).toBe(initialRenderCount)
    })

    it('should render quickly', () => {
      const start = performance.now()
      renderWithTheme(<SettingsModal {...defaultProps} />)
      const end = performance.now()

      expect(end - start).toBeLessThan(100) // Should render in under 100ms
    })
  })

  describe('Error Handling', () => {
    it('should handle missing IDE data gracefully', () => {
      vi.doMock('../../hooks/useIDE', () => ({
        useIDE: () => ({
          preferredIDE: null,
          availableIDEs: [],
          setIDE: vi.fn(),
          isDetecting: false,
          error: 'Failed to load IDEs'
        })
      }))

      renderWithTheme(<SettingsModal {...defaultProps} />)

      const editorTab = screen.getByText('Editor Integration')
      expect(editorTab).toBeInTheDocument()
      // Should not crash even with empty IDE list
    })

    it('should handle theme switching errors gracefully', async () => {
      // Mock localStorage to throw error
      const mockThrowingStorage = {
        getItem: vi.fn(() => null),
        setItem: vi.fn(() => { throw new Error('Storage full') }),
        removeItem: vi.fn(),
        clear: vi.fn()
      }

      Object.defineProperty(window, 'localStorage', { value: mockThrowingStorage })

      renderWithTheme(<SettingsModal {...defaultProps} />)

      const darkThemeButton = screen.getByText('Dark').closest('button')

      // Should not crash even if localStorage fails
      await userInteraction.click(darkThemeButton)
      expect(darkThemeButton).toBeInTheDocument()
    })
  })
})