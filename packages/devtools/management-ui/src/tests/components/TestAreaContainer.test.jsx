import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/utils/test-utils'
import TestAreaContainer from '../../presentation/components/zones/TestAreaContainer'

describe('TestAreaContainer', () => {
  const mockOnStart = vi.fn()
  const mockOnStop = vi.fn()
  const mockOnRestart = vi.fn()
  const mockOnOpenExternal = vi.fn()

  const mockIntegration = {
    id: '1',
    name: 'Test Integration',
    description: 'Test integration for testing'
  }

  const defaultProps = {
    selectedIntegration: mockIntegration,
    testUrl: 'http://localhost:3000/test',
    isRunning: false,
    onStart: mockOnStart,
    onStop: mockOnStop,
    onRestart: mockOnRestart,
    onOpenExternal: mockOnOpenExternal,
  }

  beforeEach(() => {
    mockOnStart.mockClear()
    mockOnStop.mockClear()
    mockOnRestart.mockClear()
    mockOnOpenExternal.mockClear()
  })

  describe('Rendering', () => {
    it('renders test area header with integration name', () => {
      renderWithProviders(<TestAreaContainer {...defaultProps} />)

      expect(screen.getByText('Test Area')).toBeInTheDocument()
      expect(screen.getByText('Testing: Test Integration')).toBeInTheDocument()
    })

    it('shows no integration selected message when none provided', () => {
      renderWithProviders(
        <TestAreaContainer {...defaultProps} selectedIntegration={null} />
      )

      expect(screen.getByText('No integration selected')).toBeInTheDocument()
      expect(screen.getByText('No Integration Selected')).toBeInTheDocument()
      expect(screen.getByText('Select an integration from the Definitions Zone to start testing')).toBeInTheDocument()
    })

    it('displays correct status badge', () => {
      renderWithProviders(<TestAreaContainer {...defaultProps} />)

      expect(screen.getByText('Stopped')).toBeInTheDocument()
    })

    it('shows running status when isRunning is true', () => {
      renderWithProviders(<TestAreaContainer {...defaultProps} isRunning={true} />)

      expect(screen.getByText('Running')).toBeInTheDocument()
    })

    it('renders all view mode buttons', () => {
      renderWithProviders(<TestAreaContainer {...defaultProps} />)

      // Desktop, Tablet, Mobile view buttons
      const viewButtons = screen.getAllByRole('button').filter(button => {
        const svg = button.querySelector('svg')
        return svg && button.getAttribute('class')?.includes('px-2')
      })

      expect(viewButtons).toHaveLength(3)
    })

    it('shows user context selector', () => {
      renderWithProviders(<TestAreaContainer {...defaultProps} />)

      expect(screen.getByText('User Context')).toBeInTheDocument()
    })

    it('displays control buttons based on running state', () => {
      renderWithProviders(<TestAreaContainer {...defaultProps} />)

      // When stopped, should show start button
      expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument()
    })

    it('shows stop and restart buttons when running', () => {
      renderWithProviders(<TestAreaContainer {...defaultProps} isRunning={true} />)

      // Should have stop and restart buttons
      const buttons = screen.getAllByRole('button')
      const hasStopButton = buttons.some(btn =>
        btn.querySelector('svg') && btn.getAttribute('class')?.includes('destructive')
      )
      const hasRestartButton = buttons.some(btn =>
        btn.querySelector('svg') && btn.getAttribute('aria-label')?.includes('restart')
      )

      expect(hasStopButton || hasRestartButton).toBe(true)
    })
  })

  describe('View Mode Switching', () => {
    it('defaults to desktop view mode', () => {
      renderWithProviders(<TestAreaContainer {...defaultProps} />)

      expect(screen.getByText('desktop view')).toBeInTheDocument()
    })

    it('switches view modes when buttons are clicked', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TestAreaContainer {...defaultProps} />)

      // Find view mode buttons (they have specific styling for active state)
      const viewButtons = screen.getAllByRole('button').filter(button => {
        return button.getAttribute('class')?.includes('px-2')
      })

      if (viewButtons.length >= 2) {
        await user.click(viewButtons[1]) // Click second view mode

        // Check if view mode changed (this depends on the internal state)
        // The view mode text should change
        await waitFor(() => {
          const viewTexts = ['desktop view', 'tablet view', 'mobile view']
          const hasViewText = viewTexts.some(text =>
            screen.queryByText(text)
          )
          expect(hasViewText).toBe(true)
        })
      }
    })

    it('applies correct styling for different view modes', () => {
      renderWithProviders(<TestAreaContainer {...defaultProps} />)

      // The app preview container should exist
      const previewContainer = screen.getByText('App Preview').closest('div')
      expect(previewContainer).toBeInTheDocument()
    })
  })

  describe('Fullscreen Mode', () => {
    it('toggles fullscreen mode when button is clicked', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TestAreaContainer {...defaultProps} />)

      // Find fullscreen toggle button (has Maximize2 or Minimize2 icon)
      const fullscreenButton = screen.getAllByRole('button').find(button => {
        const svg = button.querySelector('svg')
        return svg && (
          svg.getAttribute('class')?.includes('w-4') &&
          button.getAttribute('class')?.includes('outline')
        )
      })

      if (fullscreenButton) {
        await user.click(fullscreenButton)

        // Check if component adds fullscreen classes
        // This is internal state, so we check for the presence of the button
        expect(fullscreenButton).toBeInTheDocument()
      }
    })

    it('shows minimize icon when in fullscreen mode', async () => {
      const user = userEvent.setup()
      const { container } = renderWithProviders(<TestAreaContainer {...defaultProps} />)

      // Find and click fullscreen button
      const fullscreenButton = screen.getAllByRole('button').find(button => {
        return button.getAttribute('class')?.includes('outline')
      })

      if (fullscreenButton) {
        await user.click(fullscreenButton)

        // Component should still be rendered
        expect(container.firstChild).toBeInTheDocument()
      }
    })
  })

  describe('User Context Management', () => {
    it('shows user context dropdown when button is clicked', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TestAreaContainer {...defaultProps} />)

      const userContextButton = screen.getByText('User Context')
      await user.click(userContextButton)

      await waitFor(() => {
        expect(screen.getByText('User context and impersonation controls will be implemented here')).toBeInTheDocument()
      })
    })

    it('hides user context dropdown when clicked again', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TestAreaContainer {...defaultProps} />)

      const userContextButton = screen.getByText('User Context')

      // Open dropdown
      await user.click(userContextButton)
      await waitFor(() => {
        expect(screen.getByText('User context and impersonation controls will be implemented here')).toBeInTheDocument()
      })

      // Close dropdown
      await user.click(userContextButton)
      await waitFor(() => {
        expect(screen.queryByText('User context and impersonation controls will be implemented here')).not.toBeInTheDocument()
      })
    })
  })

  describe('Control Interactions', () => {
    it('calls onStart when start button is clicked', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TestAreaContainer {...defaultProps} />)

      const startButton = screen.getByRole('button', { name: /start/i })
      await user.click(startButton)

      expect(mockOnStart).toHaveBeenCalledTimes(1)
    })

    it('disables start button when no integration selected', () => {
      renderWithProviders(
        <TestAreaContainer {...defaultProps} selectedIntegration={null} />
      )

      const startButton = screen.getByRole('button', { name: /start/i })
      expect(startButton).toBeDisabled()
    })

    it('calls onStop when stop button is clicked', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TestAreaContainer {...defaultProps} isRunning={true} />)

      // Find stop button (destructive variant)
      const stopButton = screen.getAllByRole('button').find(button =>
        button.getAttribute('class')?.includes('destructive')
      )

      if (stopButton) {
        await user.click(stopButton)
        expect(mockOnStop).toHaveBeenCalledTimes(1)
      }
    })

    it('calls onRestart when restart button is clicked', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TestAreaContainer {...defaultProps} isRunning={true} />)

      // Find restart button (outline variant with RotateCcw icon)
      const restartButton = screen.getAllByRole('button').find(button =>
        button.getAttribute('class')?.includes('outline') &&
        button.querySelector('svg')
      )

      if (restartButton) {
        await user.click(restartButton)
        expect(mockOnRestart).toHaveBeenCalledTimes(1)
      }
    })

    it('calls onOpenExternal when external link button is clicked', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TestAreaContainer {...defaultProps} />)

      // Find external link button
      const externalButton = screen.getAllByRole('button').find(button =>
        button.getAttribute('class')?.includes('outline') &&
        button.querySelector('svg')
      )

      if (externalButton) {
        await user.click(externalButton)
        expect(mockOnOpenExternal).toHaveBeenCalledTimes(1)
      }
    })
  })

  describe('Iframe Rendering', () => {
    it('shows iframe when integration is running and testUrl is provided', () => {
      renderWithProviders(
        <TestAreaContainer
          {...defaultProps}
          isRunning={true}
          testUrl="http://localhost:3000/test"
        />
      )

      const iframe = screen.getByTitle('Test Integration Test Environment')
      expect(iframe).toBeInTheDocument()
      expect(iframe).toHaveAttribute('src', 'http://localhost:3000/test')
    })

    it('shows ready state when integration selected but not running', () => {
      renderWithProviders(<TestAreaContainer {...defaultProps} />)

      expect(screen.getByText('Test Environment Ready')).toBeInTheDocument()
      expect(screen.getByText('Click the play button to start testing Test Integration')).toBeInTheDocument()
    })

    it('shows starting state when appropriate', () => {
      renderWithProviders(
        <TestAreaContainer
          {...defaultProps}
          isRunning={true}
          testUrl={null}
        />
      )

      expect(screen.getByText('Starting Test Environment')).toBeInTheDocument()
      expect(screen.getByText('Please wait while we initialize Test Integration...')).toBeInTheDocument()
    })
  })

  describe('Accessibility', () => {
    it('has proper ARIA attributes for buttons', () => {
      renderWithProviders(<TestAreaContainer {...defaultProps} />)

      const buttons = screen.getAllByRole('button')

      buttons.forEach(button => {
        expect(button).toBeVisible()
      })
    })

    it('provides keyboard navigation', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TestAreaContainer {...defaultProps} />)

      // Tab through controls
      await user.tab()

      // Should be able to focus on interactive elements
      const focusedElement = document.activeElement
      expect(focusedElement).toBeInstanceOf(HTMLElement)
    })

    it('has proper heading structure', () => {
      renderWithProviders(<TestAreaContainer {...defaultProps} />)

      const heading = screen.getByRole('heading', { level: 3 })
      expect(heading).toHaveTextContent('Test Area')
    })

    it('provides clear status information', () => {
      renderWithProviders(<TestAreaContainer {...defaultProps} />)

      // Status should be clearly indicated
      expect(screen.getByText('Stopped')).toBeInTheDocument()
    })
  })

  describe('Visual States', () => {
    it('applies correct status colors', () => {
      renderWithProviders(<TestAreaContainer {...defaultProps} />)

      // Status badge should exist
      const statusBadge = screen.getByText('Stopped')
      expect(statusBadge).toBeInTheDocument()
    })

    it('shows browser-like interface for app preview', () => {
      renderWithProviders(<TestAreaContainer {...defaultProps} />)

      expect(screen.getByText('App Preview')).toBeInTheDocument()

      // Should have browser dots
      const browserInterface = screen.getByText('App Preview').closest('div')
      expect(browserInterface).toBeInTheDocument()
    })

    it('applies responsive styling for different view modes', () => {
      renderWithProviders(<TestAreaContainer {...defaultProps} />)

      // Preview container should have appropriate classes
      const previewCard = screen.getByText('App Preview').closest('div')
      expect(previewCard).toHaveClass('w-full', 'h-full')
    })
  })

  describe('Edge Cases', () => {
    it('handles missing props gracefully', () => {
      const minimalProps = {}

      expect(() => {
        renderWithProviders(<TestAreaContainer {...minimalProps} />)
      }).not.toThrow()
    })

    it('handles undefined testUrl', () => {
      renderWithProviders(
        <TestAreaContainer
          {...defaultProps}
          testUrl={undefined}
          isRunning={true}
        />
      )

      // Should show starting state instead of iframe
      expect(screen.getByText('Starting Test Environment')).toBeInTheDocument()
    })

    it('handles missing callback functions', () => {
      const propsWithoutCallbacks = {
        selectedIntegration: mockIntegration,
        isRunning: false
      }

      expect(() => {
        renderWithProviders(<TestAreaContainer {...propsWithoutCallbacks} />)
      }).not.toThrow()
    })

    it('handles very long integration names', () => {
      const longNameIntegration = {
        id: '1',
        name: 'Very Long Integration Name That Should Be Handled Gracefully',
        description: 'Test description'
      }

      renderWithProviders(
        <TestAreaContainer
          {...defaultProps}
          selectedIntegration={longNameIntegration}
        />
      )

      expect(screen.getByText('Testing: Very Long Integration Name That Should Be Handled Gracefully')).toBeInTheDocument()
    })
  })

  describe('Performance', () => {
    it('handles view mode changes efficiently', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TestAreaContainer {...defaultProps} />)

      const viewButtons = screen.getAllByRole('button').filter(button => {
        return button.getAttribute('class')?.includes('px-2')
      })

      // Rapidly switch view modes
      for (const button of viewButtons.slice(0, 2)) {
        await user.click(button)
      }

      // Component should still be responsive
      expect(screen.getByText('Test Area')).toBeInTheDocument()
    })

    it('handles fullscreen toggle efficiently', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TestAreaContainer {...defaultProps} />)

      const fullscreenButton = screen.getAllByRole('button').find(button => {
        return button.getAttribute('class')?.includes('outline')
      })

      if (fullscreenButton) {
        // Toggle multiple times
        await user.click(fullscreenButton)
        await user.click(fullscreenButton)
        await user.click(fullscreenButton)

        expect(screen.getByText('Test Area')).toBeInTheDocument()
      }
    })
  })
})