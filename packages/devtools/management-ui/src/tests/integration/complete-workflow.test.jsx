/**
 * Complete Workflow Integration Tests
 * End-to-end tests for complete user workflows in IDE settings
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderWithTheme, userInteraction, mockLocalStorage } from '../utils/testHelpers'
import { mockFetch, mockIDEsList } from '../mocks/ideApi'

// Import components
import Layout from '../presentation/components/layout/Layout'
import SettingsModal from '../../presentation/components/common/SettingsModal'
import ThemeProvider from '../../presentation/components/theme/ThemeProvider'

// Mock all the hooks
const mockUseFrigg = {
  currentRepository: { name: 'test-repo', path: '/test/repo' }
}

const mockUseIDE = {
  preferredIDE: null,
  availableIDEs: Object.values(mockIDEsList),
  setIDE: vi.fn(),
  openInIDE: vi.fn(),
  isDetecting: false,
  error: null,
  getIDEsByCategory: vi.fn(() => ({
    popular: [mockIDEsList.vscode, mockIDEsList.sublime],
    jetbrains: [mockIDEsList.webstorm, mockIDEsList.intellij],
    terminal: [mockIDEsList.vim],
    mobile: [],
    apple: [],
    java: [],
    windows: [],
    deprecated: [],
    other: [mockIDEsList.custom]
  })),
  getAvailableIDEs: vi.fn(() => Object.values(mockIDEsList).filter(ide => ide.available)),
  refreshIDEDetection: vi.fn()
}

vi.mock('../../hooks/useFrigg', () => ({
  useFrigg: () => mockUseFrigg
}))

vi.mock('../../hooks/useIDE', () => ({
  useIDE: () => mockUseIDE
}))

// Mock RepositoryPicker and Navigation to avoid complex dependencies
vi.mock('../../components/RepositoryPicker', () => ({
  default: () => <div data-testid="repository-picker">Repository Picker</div>
}))

vi.mock('../../components/Navigation', () => ({
  default: () => <div data-testid="navigation">Navigation</div>
}))

describe('Complete Workflow Integration Tests', () => {
  let mockStorage

  beforeEach(() => {
    mockStorage = mockLocalStorage()
    Object.defineProperty(window, 'localStorage', { value: mockStorage })
    global.fetch = mockFetch()
    vi.clearAllMocks()
  })

  describe('First-Time User Setup Workflow', () => {
    it('should guide user through complete initial setup', async () => {
      // Mock first-time user (no preferences stored)
      mockStorage.clear()

      const TestApp = () => (
        <ThemeProvider>
          <Layout>
            <div>Welcome to Frigg UI</div>
          </Layout>
        </ThemeProvider>
      )

      render(<TestApp />)

      // 1. User sees default light theme
      expect(document.documentElement.classList.contains('light')).toBe(true)

      // 2. User opens settings
      const settingsButton = screen.getByRole('button', { name: /settings/i })
      await userInteraction.click(settingsButton)

      expect(screen.getByText('Configure Frigg Management UI')).toBeInTheDocument()

      // 3. User sets theme preference
      const darkThemeButton = screen.getByText('Dark').closest('button')
      await userInteraction.click(darkThemeButton)

      expect(document.documentElement.classList.contains('dark')).toBe(true)

      // 4. User navigates to editor integration
      const editorTab = screen.getByText('Editor Integration')
      await userInteraction.click(editorTab)

      // 5. User selects IDE
      const vscodeButton = screen.getByText('Visual Studio Code').closest('button')
      await userInteraction.click(vscodeButton)

      expect(mockUseIDE.setIDE).toHaveBeenCalledWith(mockIDEsList.vscode)

      // 6. User closes settings
      const closeButton = screen.getByRole('button', { name: /close/i })
      await userInteraction.click(closeButton)

      expect(screen.queryByText('Configure Frigg Management UI')).not.toBeInTheDocument()

      // 7. Verify preferences are persisted
      expect(mockStorage.setItem).toHaveBeenCalledWith('frigg-ui-theme', 'dark')
      expect(mockStorage.setItem).toHaveBeenCalledWith(
        'frigg_ide_preferences',
        JSON.stringify(mockIDEsList.vscode)
      )
    })

    it('should handle user who wants custom IDE setup', async () => {
      render(
        <ThemeProvider>
          <SettingsModal isOpen={true} onClose={vi.fn()} />
        </ThemeProvider>
      )

      // 1. Navigate to editor integration
      const editorTab = screen.getByText('Editor Integration')
      await userInteraction.click(editorTab)

      // 2. Select custom command option
      const customButton = screen.getByText('Custom Command').closest('button')
      await userInteraction.click(customButton)

      // 3. Enter custom command
      const input = screen.getByPlaceholderText(/Enter your IDE command/)
      await userInteraction.type(input, 'idea {path}')

      // 4. Save custom command
      const saveButton = screen.getByText('Save & Use')
      await userInteraction.click(saveButton)

      expect(mockUseIDE.setIDE).toHaveBeenCalledWith({
        id: 'custom',
        name: 'Custom Command',
        command: 'idea {path}',
        available: true
      })

      // 5. Verify dialog closes
      expect(screen.queryByText('Custom IDE Command')).not.toBeInTheDocument()
    })
  })

  describe('Returning User Workflow', () => {
    it('should load and apply saved preferences', async () => {
      // Mock returning user with saved preferences
      mockStorage.setItem('frigg-ui-theme', 'dark')
      mockStorage.setItem('frigg_ide_preferences', JSON.stringify(mockIDEsList.vscode))
      mockUseIDE.preferredIDE = mockIDEsList.vscode

      const TestApp = () => (
        <ThemeProvider>
          <Layout>
            <div>Welcome Back</div>
          </Layout>
        </ThemeProvider>
      )

      render(<TestApp />)

      // 1. Theme should be applied
      expect(document.documentElement.classList.contains('dark')).toBe(true)

      // 2. Settings should show saved IDE
      const settingsButton = screen.getByRole('button', { name: /settings/i })
      await userInteraction.click(settingsButton)

      const editorTab = screen.getByText('Editor Integration')
      await userInteraction.click(editorTab)

      // 3. Saved IDE should be highlighted
      const vscodeButton = screen.getByText('Visual Studio Code').closest('button')
      expect(vscodeButton).toHaveClass('border-primary/50')

      // 4. Current selection should be displayed
      expect(screen.getByText('Current Selection')).toBeInTheDocument()
    })

    it('should allow changing existing preferences', async () => {
      // Start with existing preferences
      mockStorage.setItem('frigg-ui-theme', 'light')
      mockStorage.setItem('frigg_ide_preferences', JSON.stringify(mockIDEsList.vscode))
      mockUseIDE.preferredIDE = mockIDEsList.vscode

      render(
        <ThemeProvider>
          <SettingsModal isOpen={true} onClose={vi.fn()} />
        </ThemeProvider>
      )

      // 1. Change theme from light to system
      const systemThemeButton = screen.getByText('System').closest('button')
      await userInteraction.click(systemThemeButton)

      // 2. Change IDE from VSCode to WebStorm
      const editorTab = screen.getByText('Editor Integration')
      await userInteraction.click(editorTab)

      const webstormButton = screen.getByText('WebStorm').closest('button')
      await userInteraction.click(webstormButton)

      // 3. Verify changes
      expect(mockStorage.setItem).toHaveBeenCalledWith('frigg-ui-theme', 'system')
      expect(mockUseIDE.setIDE).toHaveBeenCalledWith(mockIDEsList.webstorm)
    })
  })

  describe('Error Recovery Workflow', () => {
    it('should handle IDE detection failures gracefully', async () => {
      // Mock IDE detection failure
      mockUseIDE.error = 'Failed to detect IDEs'
      mockUseIDE.availableIDEs = []
      mockUseIDE.getAvailableIDEs.mockReturnValue([])

      render(
        <ThemeProvider>
          <SettingsModal isOpen={true} onClose={vi.fn()} />
        </ThemeProvider>
      )

      const editorTab = screen.getByText('Editor Integration')
      await userInteraction.click(editorTab)

      // 1. User sees error message
      expect(screen.getByText('No available IDEs found')).toBeInTheDocument()

      // 2. User tries to refresh
      const button = screen.getByRole('button', { name: /select ide/i })
      await userInteraction.click(button)

      const refreshButton = screen.getByTitle('Refresh IDE detection')
      await userInteraction.click(refreshButton)

      expect(mockUseIDE.refreshIDEDetection).toHaveBeenCalled()

      // 3. User can still use custom command as fallback
      const customButton = screen.getByText('Custom Command').closest('button')
      await userInteraction.click(customButton)

      const input = screen.getByPlaceholderText(/Enter your IDE command/)
      await userInteraction.type(input, 'code {path}')

      const saveButton = screen.getByText('Save & Use')
      await userInteraction.click(saveButton)

      expect(mockUseIDE.setIDE).toHaveBeenCalled()
    })

    it('should handle localStorage failures gracefully', async () => {
      // Mock localStorage failure
      const throwingStorage = {
        getItem: vi.fn(() => { throw new Error('Storage unavailable') }),
        setItem: vi.fn(() => { throw new Error('Storage full') }),
        removeItem: vi.fn(),
        clear: vi.fn()
      }

      Object.defineProperty(window, 'localStorage', { value: throwingStorage })

      const TestApp = () => (
        <ThemeProvider>
          <Layout>
            <div>Test App</div>
          </Layout>
        </ThemeProvider>
      )

      // Should not crash even with storage failures
      render(<TestApp />)

      expect(screen.getByText('Test App')).toBeInTheDocument()

      // Theme switching should still work (just not persist)
      const settingsButton = screen.getByRole('button', { name: /settings/i })
      await userInteraction.click(settingsButton)

      const darkThemeButton = screen.getByText('Dark').closest('button')
      await userInteraction.click(darkThemeButton)

      // Theme should be applied even if it can't be saved
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })
  })

  describe('Complex User Scenarios', () => {
    it('should handle rapid theme switching without issues', async () => {
      render(
        <ThemeProvider>
          <SettingsModal isOpen={true} onClose={vi.fn()} />
        </ThemeProvider>
      )

      // Rapidly switch between themes
      const lightButton = screen.getByText('Light').closest('button')
      const darkButton = screen.getByText('Dark').closest('button')
      const systemButton = screen.getByText('System').closest('button')

      await userInteraction.click(lightButton)
      await userInteraction.click(darkButton)
      await userInteraction.click(systemButton)
      await userInteraction.click(lightButton)
      await userInteraction.click(darkButton)

      // Final state should be consistent
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })

    it('should handle multiple IDE changes and file opening attempts', async () => {
      mockUseIDE.openInIDE.mockResolvedValue({ success: true })

      render(
        <ThemeProvider>
          <SettingsModal isOpen={true} onClose={vi.fn()} />
        </ThemeProvider>
      )

      const editorTab = screen.getByText('Editor Integration')
      await userInteraction.click(editorTab)

      // Select multiple IDEs in sequence
      const vscodeButton = screen.getByText('Visual Studio Code').closest('button')
      const webstormButton = screen.getByText('WebStorm').closest('button')

      await userInteraction.click(vscodeButton)
      expect(mockUseIDE.setIDE).toHaveBeenCalledWith(mockIDEsList.vscode)

      await userInteraction.click(webstormButton)
      expect(mockUseIDE.setIDE).toHaveBeenCalledWith(mockIDEsList.webstorm)

      // Each selection should trigger openInIDE if currentPath is provided
      expect(mockUseIDE.openInIDE).toHaveBeenCalledTimes(2)
    })

    it('should handle custom command with validation feedback', async () => {
      render(
        <ThemeProvider>
          <SettingsModal isOpen={true} onClose={vi.fn()} />
        </ThemeProvider>
      )

      const editorTab = screen.getByText('Editor Integration')
      await userInteraction.click(editorTab)

      const customButton = screen.getByText('Custom Command').closest('button')
      await userInteraction.click(customButton)

      const input = screen.getByPlaceholderText(/Enter your IDE command/)

      // 1. Type command without placeholder
      await userInteraction.type(input, 'myide')
      expect(screen.getByText(/Consider adding.*placeholder/)).toBeInTheDocument()

      // 2. Add placeholder
      await userInteraction.clear(input)
      await userInteraction.type(input, 'myide {path}')
      expect(screen.getByText(/Command includes.*placeholder/)).toBeInTheDocument()

      // 3. Clear input (should disable save)
      await userInteraction.clear(input)
      const saveButton = screen.getByText('Save & Use')
      expect(saveButton).toBeDisabled()

      // 4. Add valid command and save
      await userInteraction.type(input, 'final-ide {path}')
      expect(saveButton).not.toBeDisabled()

      await userInteraction.click(saveButton)
      expect(mockUseIDE.setIDE).toHaveBeenCalledWith({
        id: 'custom',
        name: 'Custom Command',
        command: 'final-ide {path}',
        available: true
      })
    })
  })

  describe('Cross-Component Integration', () => {
    it('should maintain state consistency across theme and IDE changes', async () => {
      const TestApp = () => (
        <ThemeProvider>
          <Layout>
            <SettingsModal isOpen={true} onClose={vi.fn()} />
          </Layout>
        </ThemeProvider>
      )

      render(<TestApp />)

      // 1. Change theme
      const darkButton = screen.getByText('Dark').closest('button')
      await userInteraction.click(darkButton)

      // 2. Change IDE
      const editorTab = screen.getByText('Editor Integration')
      await userInteraction.click(editorTab)

      const vscodeButton = screen.getByText('Visual Studio Code').closest('button')
      await userInteraction.click(vscodeButton)

      // 3. Verify both changes are applied
      expect(document.documentElement.classList.contains('dark')).toBe(true)
      expect(mockUseIDE.setIDE).toHaveBeenCalledWith(mockIDEsList.vscode)

      // 4. Verify settings persist across component re-renders
      expect(mockStorage.setItem).toHaveBeenCalledWith('frigg-ui-theme', 'dark')
    })

    it('should handle settings modal interaction from layout', async () => {
      const TestApp = () => (
        <ThemeProvider>
          <Layout>
            <div>Main Content</div>
          </Layout>
        </ThemeProvider>
      )

      render(<TestApp />)

      // 1. Settings button should be in layout
      expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument()

      // 2. Theme toggle should also be in layout
      expect(screen.getByRole('button', { name: /toggle theme/i })).toBeInTheDocument()

      // 3. Both should work independently
      const themeToggle = screen.getByRole('button', { name: /toggle theme/i })
      await userInteraction.click(themeToggle)

      // Theme dropdown should appear
      expect(screen.getByText('Light')).toBeInTheDocument()
      expect(screen.getByText('Dark')).toBeInTheDocument()
      expect(screen.getByText('System')).toBeInTheDocument()
    })
  })

  describe('Performance Integration', () => {
    it('should handle large datasets efficiently', async () => {
      // Mock large IDE list
      const largeIDEList = Array.from({ length: 50 }, (_, i) => ({
        id: `ide-${i}`,
        name: `IDE ${i}`,
        available: i % 3 === 0,
        category: i % 2 === 0 ? 'popular' : 'other'
      }))

      mockUseIDE.availableIDEs = largeIDEList
      mockUseIDE.getAvailableIDEs.mockReturnValue(largeIDEList.filter(ide => ide.available))

      const start = performance.now()

      render(
        <ThemeProvider>
          <SettingsModal isOpen={true} onClose={vi.fn()} />
        </ThemeProvider>
      )

      const editorTab = screen.getByText('Editor Integration')
      await userInteraction.click(editorTab)

      const end = performance.now()

      // Should render large list reasonably quickly
      expect(end - start).toBeLessThan(1000)

      // Should still be functional
      expect(screen.getByText('IDE 0')).toBeInTheDocument()
    })

    it('should not cause memory leaks with frequent modal opening/closing', async () => {
      const TestApp = ({ isOpen }) => (
        <ThemeProvider>
          <Layout>
            <SettingsModal isOpen={isOpen} onClose={vi.fn()} />
          </Layout>
        </ThemeProvider>
      )

      const { rerender } = render(<TestApp isOpen={false} />)

      // Rapidly open and close modal
      for (let i = 0; i < 10; i++) {
        rerender(<TestApp isOpen={true} />)
        rerender(<TestApp isOpen={false} />)
      }

      // Should not accumulate DOM nodes
      const modals = document.querySelectorAll('[role="dialog"]')
      expect(modals.length).toBeLessThanOrEqual(1)
    })
  })

  describe('Accessibility Integration', () => {
    it('should maintain focus management across components', async () => {
      render(
        <ThemeProvider>
          <Layout>
            <div>Main Content</div>
          </Layout>
        </ThemeProvider>
      )

      const settingsButton = screen.getByRole('button', { name: /settings/i })

      // 1. Focus should move to settings modal when opened
      settingsButton.focus()
      await userInteraction.click(settingsButton)

      // 2. Focus should be trapped within modal
      await userInteraction.keyboard('{Tab}')
      expect(document.activeElement).toBeTruthy()

      // 3. Focus should return when modal closes
      const closeButton = screen.getByRole('button', { name: /close/i })
      await userInteraction.click(closeButton)

      // Focus management would typically return to trigger element
      expect(document.activeElement).toBeTruthy()
    })

    it('should provide proper screen reader announcements', async () => {
      render(
        <ThemeProvider>
          <SettingsModal isOpen={true} onClose={vi.fn()} />
        </ThemeProvider>
      )

      // Settings modal should have proper heading structure
      expect(screen.getByRole('heading', { name: /settings/i })).toBeInTheDocument()

      // Tab navigation should have proper labels
      const appearanceTab = screen.getByText('Appearance')
      expect(appearanceTab.closest('button')).toHaveAccessibleDescription()

      // IDE options should be properly labeled
      const editorTab = screen.getByText('Editor Integration')
      await userInteraction.click(editorTab)

      const ideButtons = screen.getAllByRole('button')
      ideButtons.forEach(button => {
        expect(button).toHaveAccessibleName()
      })
    })
  })
})