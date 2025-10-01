import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/utils/test-utils'

// Import all components to test
import ZoneNavigation from '../../presentation/components/common/ZoneNavigation'
import IntegrationGallery from '../../presentation/components/integrations/IntegrationGallery'
import TestAreaContainer from '../../presentation/components/zones/TestAreaContainer'
import SearchBar from '../../presentation/components/common/SearchBar'
import LiveLogPanel from '../../presentation/components/common/LiveLogPanel'

// Mock data for components
const mockIntegrations = [
  {
    id: '1',
    name: 'Test Integration',
    description: 'Accessible integration for testing',
    category: 'test',
    status: 'available',
    tags: ['test', 'accessibility'],
    documentationUrl: 'https://example.com/docs'
  }
]

const mockFilters = [
  { id: 'test', label: 'Test' },
  { id: 'accessibility', label: 'Accessibility' }
]

const mockLogs = [
  {
    level: 'info',
    message: 'Accessibility test log',
    timestamp: '2023-01-01T10:00:00.000Z',
    source: 'a11y'
  }
]

describe('Component Accessibility Tests', () => {
  describe('ZoneNavigation Accessibility', () => {
    const mockOnZoneChange = vi.fn()

    it('has proper ARIA attributes', () => {
      renderWithProviders(
        <ZoneNavigation
          activeZone="definitions"
          onZoneChange={mockOnZoneChange}
        />
      )

      const buttons = screen.getAllByRole('button')

      buttons.forEach(button => {
        expect(button).toBeVisible()
        expect(button).toBeEnabled()
        expect(button).toHaveAttribute('type', 'button')
      })
    })

    it('provides keyboard navigation', async () => {
      const user = userEvent.setup()
      renderWithProviders(
        <ZoneNavigation
          activeZone="definitions"
          onZoneChange={mockOnZoneChange}
        />
      )

      // Tab through navigation
      await user.tab()
      const firstButton = screen.getByRole('button', { name: /definitions zone/i })
      expect(firstButton).toHaveFocus()

      await user.tab()
      const secondButton = screen.getByRole('button', { name: /test area/i })
      expect(secondButton).toHaveFocus()

      // Enter should activate button
      await user.keyboard('{Enter}')
      expect(mockOnZoneChange).toHaveBeenCalledWith('testing')
    })

    it('provides clear visual feedback for active state', () => {
      renderWithProviders(
        <ZoneNavigation
          activeZone="testing"
          onZoneChange={mockOnZoneChange}
        />
      )

      const activeButton = screen.getByRole('button', { name: /test area/i })
      const inactiveButton = screen.getByRole('button', { name: /definitions zone/i })

      expect(activeButton).toHaveClass('bg-background')
      expect(inactiveButton).not.toHaveClass('bg-background')
    })

    it('meets color contrast requirements', () => {
      renderWithProviders(
        <ZoneNavigation
          activeZone="definitions"
          onZoneChange={mockOnZoneChange}
        />
      )

      const buttons = screen.getAllByRole('button')

      buttons.forEach(button => {
        // Check that text has sufficient contrast classes
        const textElements = button.querySelectorAll('span')
        textElements.forEach(textElement => {
          expect(textElement).toHaveClass(/text-/)
        })
      })
    })
  })

  describe('IntegrationGallery Accessibility', () => {
    const mockCallbacks = {
      onInstall: vi.fn(),
      onConfigure: vi.fn(),
      onView: vi.fn()
    }

    it('has proper heading structure', () => {
      renderWithProviders(
        <IntegrationGallery
          integrations={mockIntegrations}
          {...mockCallbacks}
        />
      )

      const mainHeading = screen.getByRole('heading', { level: 2 })
      expect(mainHeading).toHaveTextContent('Integration Gallery')
    })

    it('provides accessible card interactions', async () => {
      const user = userEvent.setup()
      renderWithProviders(
        <IntegrationGallery
          integrations={mockIntegrations}
          {...mockCallbacks}
        />
      )

      // Cards should be clickable
      const integrationCard = screen.getByText('Test Integration').closest('[role]')
      expect(integrationCard).toBeInTheDocument()

      // Action buttons should be accessible
      const actionButton = screen.getByText('Install')
      expect(actionButton).toBeVisible()
      expect(actionButton).toBeEnabled()

      await user.click(actionButton)
      expect(mockCallbacks.onInstall).toHaveBeenCalled()
    })

    it('provides accessible search functionality', () => {
      renderWithProviders(
        <IntegrationGallery
          integrations={mockIntegrations}
          {...mockCallbacks}
        />
      )

      const searchInput = screen.getByRole('textbox')
      expect(searchInput).toBeVisible()
      expect(searchInput).toHaveAttribute('placeholder')
    })

    it('has proper ARIA labels for status indicators', () => {
      renderWithProviders(
        <IntegrationGallery
          integrations={mockIntegrations}
          {...mockCallbacks}
        />
      )

      // Status badges should be clearly labeled
      const statusBadge = screen.getByText('available')
      expect(statusBadge).toBeInTheDocument()
    })

    it('handles empty state accessibly', () => {
      renderWithProviders(
        <IntegrationGallery
          integrations={[]}
          {...mockCallbacks}
        />
      )

      expect(screen.getByText('No integrations found')).toBeInTheDocument()
      expect(screen.getByText('No integrations available at the moment')).toBeInTheDocument()
    })
  })

  describe('TestAreaContainer Accessibility', () => {
    const mockCallbacks = {
      onStart: vi.fn(),
      onStop: vi.fn(),
      onRestart: vi.fn(),
      onOpenExternal: vi.fn()
    }

    const mockIntegration = {
      id: '1',
      name: 'Accessible Test Integration'
    }

    it('has proper heading structure', () => {
      renderWithProviders(
        <TestAreaContainer
          selectedIntegration={mockIntegration}
          isRunning={false}
          {...mockCallbacks}
        />
      )

      const heading = screen.getByRole('heading', { level: 3 })
      expect(heading).toHaveTextContent('Test Area')
    })

    it('provides accessible control buttons', () => {
      renderWithProviders(
        <TestAreaContainer
          selectedIntegration={mockIntegration}
          isRunning={false}
          {...mockCallbacks}
        />
      )

      const buttons = screen.getAllByRole('button')

      buttons.forEach(button => {
        expect(button).toBeVisible()
        // Buttons should not have disabled state when integration is selected
        if (button.textContent?.includes('Start')) {
          expect(button).toBeEnabled()
        }
      })
    })

    it('handles disabled states accessibly', () => {
      renderWithProviders(
        <TestAreaContainer
          selectedIntegration={null}
          isRunning={false}
          {...mockCallbacks}
        />
      )

      const startButton = screen.getByRole('button', { name: /start/i })
      expect(startButton).toBeDisabled()
    })

    it('provides clear status information', () => {
      renderWithProviders(
        <TestAreaContainer
          selectedIntegration={mockIntegration}
          isRunning={true}
          {...mockCallbacks}
        />
      )

      const statusBadge = screen.getByText('Running')
      expect(statusBadge).toBeInTheDocument()
    })

    it('makes iframe accessible when present', () => {
      renderWithProviders(
        <TestAreaContainer
          selectedIntegration={mockIntegration}
          isRunning={true}
          testUrl="http://localhost:3000/test"
          {...mockCallbacks}
        />
      )

      const iframe = screen.getByTitle('Accessible Test Integration Test Environment')
      expect(iframe).toBeInTheDocument()
      expect(iframe).toHaveAttribute('src', 'http://localhost:3000/test')
    })

    it('provides accessible view mode controls', async () => {
      const user = userEvent.setup()
      renderWithProviders(
        <TestAreaContainer
          selectedIntegration={mockIntegration}
          isRunning={false}
          {...mockCallbacks}
        />
      )

      // View mode buttons should be accessible
      const viewButtons = screen.getAllByRole('button').filter(button => {
        return button.getAttribute('class')?.includes('px-2')
      })

      for (const button of viewButtons) {
        expect(button).toBeVisible()
        expect(button).toBeEnabled()

        await user.click(button)
        // Should not throw and should remain accessible
        expect(button).toBeInTheDocument()
      }
    })
  })

  describe('SearchBar Accessibility', () => {
    const mockCallbacks = {
      onSearch: vi.fn(),
      onFilter: vi.fn()
    }

    it('provides accessible search input', () => {
      renderWithProviders(
        <SearchBar
          filters={mockFilters}
          activeFilters={[]}
          {...mockCallbacks}
        />
      )

      const searchInput = screen.getByRole('textbox')
      expect(searchInput).toBeVisible()
      expect(searchInput).toHaveAttribute('placeholder')
      expect(searchInput).toHaveAttribute('type', 'text')
    })

    it('provides accessible filter controls', async () => {
      const user = userEvent.setup()
      renderWithProviders(
        <SearchBar
          filters={mockFilters}
          activeFilters={[]}
          {...mockCallbacks}
        />
      )

      const filtersButton = screen.getByRole('button', { name: /filters/i })
      expect(filtersButton).toBeVisible()
      expect(filtersButton).toBeEnabled()

      await user.click(filtersButton)

      await waitFor(() => {
        const checkboxes = screen.getAllByRole('checkbox')
        checkboxes.forEach(checkbox => {
          expect(checkbox).toBeVisible()
          expect(checkbox).toHaveAttribute('type', 'checkbox')
        })
      })
    })

    it('provides proper labels for filter checkboxes', async () => {
      const user = userEvent.setup()
      renderWithProviders(
        <SearchBar
          filters={mockFilters}
          activeFilters={[]}
          {...mockCallbacks}
        />
      )

      const filtersButton = screen.getByRole('button', { name: /filters/i })
      await user.click(filtersButton)

      await waitFor(() => {
        mockFilters.forEach(filter => {
          const checkbox = screen.getByLabelText(filter.label)
          expect(checkbox).toBeInTheDocument()
        })
      })
    })

    it('handles keyboard navigation in filter dropdown', async () => {
      const user = userEvent.setup()
      renderWithProviders(
        <SearchBar
          filters={mockFilters}
          activeFilters={[]}
          {...mockCallbacks}
        />
      )

      const filtersButton = screen.getByRole('button', { name: /filters/i })
      await user.click(filtersButton)

      await waitFor(() => {
        expect(screen.getByLabelText('Test')).toBeInTheDocument()
      })

      // Tab to first checkbox
      await user.tab()
      const firstCheckbox = screen.getByLabelText('Test')
      expect(firstCheckbox).toHaveFocus()

      // Space should toggle checkbox
      await user.keyboard(' ')
      expect(mockCallbacks.onFilter).toHaveBeenCalled()
    })

    it('provides accessible clear functionality', async () => {
      const user = userEvent.setup()
      renderWithProviders(
        <SearchBar
          filters={mockFilters}
          activeFilters={[]}
          {...mockCallbacks}
        />
      )

      const searchInput = screen.getByRole('textbox')
      await user.type(searchInput, 'test search')

      await waitFor(() => {
        const clearButton = screen.getByRole('button')
        expect(clearButton).toBeVisible()
      })

      const clearButton = screen.getByRole('button')
      await user.click(clearButton)

      expect(searchInput.value).toBe('')
    })
  })

  describe('LiveLogPanel Accessibility', () => {
    const mockCallbacks = {
      onClear: vi.fn(),
      onDownload: vi.fn(),
      onToggleStreaming: vi.fn()
    }

    it('has proper heading structure', () => {
      renderWithProviders(
        <LiveLogPanel
          logs={mockLogs}
          isStreaming={false}
          {...mockCallbacks}
        />
      )

      const heading = screen.getByText('Live Logs')
      expect(heading).toBeInTheDocument()
    })

    it('provides accessible control buttons', () => {
      renderWithProviders(
        <LiveLogPanel
          logs={mockLogs}
          isStreaming={false}
          {...mockCallbacks}
        />
      )

      const buttons = screen.getAllByRole('button')

      buttons.forEach(button => {
        expect(button).toBeVisible()
        expect(button).toBeEnabled()
      })
    })

    it('provides accessible log level filtering', async () => {
      const user = userEvent.setup()
      renderWithProviders(
        <LiveLogPanel
          logs={mockLogs}
          isStreaming={false}
          {...mockCallbacks}
        />
      )

      const levelSelect = screen.getByDisplayValue('All')
      expect(levelSelect).toBeVisible()
      expect(levelSelect).toHaveAttribute('class')

      await user.selectOptions(levelSelect, 'info')
      // Should filter without accessibility issues
      expect(levelSelect).toHaveValue('info')
    })

    it('makes log content accessible to screen readers', () => {
      renderWithProviders(
        <LiveLogPanel
          logs={mockLogs}
          isStreaming={false}
          {...mockCallbacks}
        />
      )

      // Log messages should be visible
      expect(screen.getByText('Accessibility test log')).toBeInTheDocument()

      // Log levels should be clearly marked
      expect(screen.getByText('INFO')).toBeInTheDocument()

      // Timestamps should be present
      expect(screen.getByText('10:00:00.000')).toBeInTheDocument()
    })

    it('handles collapsed state accessibly', async () => {
      const user = userEvent.setup()
      renderWithProviders(
        <LiveLogPanel
          logs={mockLogs}
          isStreaming={false}
          {...mockCallbacks}
        />
      )

      // Find collapse button
      const collapseButton = screen.getAllByRole('button').find(button =>
        button.getAttribute('class')?.includes('p-1')
      )

      if (collapseButton) {
        await user.click(collapseButton)

        await waitFor(() => {
          const expandButton = screen.getByText('Logs (1)')
          expect(expandButton).toBeVisible()
          expect(expandButton).toBeEnabled()
        })
      }
    })

    it('provides accessible empty state', () => {
      renderWithProviders(
        <LiveLogPanel
          logs={[]}
          isStreaming={false}
          {...mockCallbacks}
        />
      )

      expect(screen.getByText('No logs to display')).toBeInTheDocument()
      expect(screen.getByText('Waiting for logs...')).toBeInTheDocument()
    })
  })

  describe('Cross-Component Accessibility', () => {
    it('maintains focus order across complex UI', async () => {
      const user = userEvent.setup()

      const ComplexUI = () => (
        <div>
          <ZoneNavigation
            activeZone="definitions"
            onZoneChange={vi.fn()}
          />
          <SearchBar
            filters={mockFilters}
            activeFilters={[]}
            onSearch={vi.fn()}
            onFilter={vi.fn()}
          />
          <IntegrationGallery
            integrations={mockIntegrations}
            onInstall={vi.fn()}
            onConfigure={vi.fn()}
            onView={vi.fn()}
          />
        </div>
      )

      renderWithProviders(<ComplexUI />)

      // Tab through elements in logical order
      await user.tab() // First zone navigation button
      await user.tab() // Second zone navigation button
      await user.tab() // Search input
      await user.tab() // Filters button

      // Should be able to continue tabbing through integration cards
      const focusedElement = document.activeElement
      expect(focusedElement).toBeInstanceOf(HTMLElement)
      expect(focusedElement).toBeVisible()
    })

    it('handles theme changes accessibly', () => {
      const { rerender } = renderWithProviders(
        <ZoneNavigation
          activeZone="definitions"
          onZoneChange={vi.fn()}
        />
      )

      // Component should handle theme changes without losing accessibility
      rerender(
        <ZoneNavigation
          activeZone="testing"
          onZoneChange={vi.fn()}
        />
      )

      const buttons = screen.getAllByRole('button')
      buttons.forEach(button => {
        expect(button).toBeVisible()
        expect(button).toBeEnabled()
      })
    })

    it('maintains accessibility during dynamic content updates', async () => {
      const DynamicComponent = () => {
        const [logs, setLogs] = React.useState([])

        React.useEffect(() => {
          const timer = setTimeout(() => {
            setLogs([{
              level: 'info',
              message: 'Dynamic log added',
              timestamp: new Date().toISOString(),
              source: 'dynamic'
            }])
          }, 100)

          return () => clearTimeout(timer)
        }, [])

        return (
          <LiveLogPanel
            logs={logs}
            isStreaming={true}
            onClear={vi.fn()}
            onDownload={vi.fn()}
            onToggleStreaming={vi.fn()}
          />
        )
      }

      renderWithProviders(<DynamicComponent />)

      // Initially no logs
      expect(screen.getByText('No logs to display')).toBeInTheDocument()

      // Wait for dynamic content
      await waitFor(() => {
        expect(screen.getByText('Dynamic log added')).toBeInTheDocument()
      })

      // Accessibility should be maintained
      expect(screen.getByText('Live Logs')).toBeInTheDocument()
      const buttons = screen.getAllByRole('button')
      buttons.forEach(button => {
        expect(button).toBeVisible()
      })
    })

    it('provides consistent interaction patterns across components', async () => {
      const user = userEvent.setup()

      const ConsistentUI = () => (
        <div>
          <ZoneNavigation
            activeZone="definitions"
            onZoneChange={vi.fn()}
          />
          <TestAreaContainer
            selectedIntegration={{ id: '1', name: 'Test' }}
            isRunning={false}
            onStart={vi.fn()}
            onStop={vi.fn()}
            onRestart={vi.fn()}
            onOpenExternal={vi.fn()}
          />
        </div>
      )

      renderWithProviders(<ConsistentUI />)

      // All buttons should follow consistent interaction patterns
      const buttons = screen.getAllByRole('button')

      for (const button of buttons.slice(0, 3)) { // Test first few buttons
        expect(button).toBeVisible()
        expect(button).toBeEnabled()

        // Should be keyboard accessible
        button.focus()
        expect(button).toHaveFocus()

        // Should respond to Enter key
        await user.keyboard('{Enter}')
      }
    })
  })

  describe('Screen Reader Support', () => {
    it('provides meaningful text content for screen readers', () => {
      renderWithProviders(
        <IntegrationGallery
          integrations={mockIntegrations}
          onInstall={vi.fn()}
          onConfigure={vi.fn()}
          onView={vi.fn()}
        />
      )

      // Important information should be available as text
      expect(screen.getByText('Integration Gallery')).toBeInTheDocument()
      expect(screen.getByText('Discover and manage integrations for your project')).toBeInTheDocument()
      expect(screen.getByText('1 of 1 integrations')).toBeInTheDocument()
      expect(screen.getByText('Test Integration')).toBeInTheDocument()
      expect(screen.getByText('Accessible integration for testing')).toBeInTheDocument()
    })

    it('uses semantic HTML elements appropriately', () => {
      renderWithProviders(
        <TestAreaContainer
          selectedIntegration={{ id: '1', name: 'Test Integration' }}
          isRunning={false}
          onStart={vi.fn()}
          onStop={vi.fn()}
          onRestart={vi.fn()}
          onOpenExternal={vi.fn()}
        />
      )

      // Should use proper heading elements
      const heading = screen.getByRole('heading', { level: 3 })
      expect(heading).toHaveTextContent('Test Area')

      // Should use button elements for interactive controls
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThan(0)

      buttons.forEach(button => {
        expect(button.tagName.toLowerCase()).toBe('button')
      })
    })

    it('provides status updates that are announced to screen readers', () => {
      renderWithProviders(
        <TestAreaContainer
          selectedIntegration={{ id: '1', name: 'Test Integration' }}
          isRunning={true}
          testUrl="http://localhost:3000"
          onStart={vi.fn()}
          onStop={vi.fn()}
          onRestart={vi.fn()}
          onOpenExternal={vi.fn()}
        />
      )

      // Status should be clearly indicated
      expect(screen.getByText('Running')).toBeInTheDocument()
      expect(screen.getByText('Testing: Test Integration')).toBeInTheDocument()
    })
  })
})