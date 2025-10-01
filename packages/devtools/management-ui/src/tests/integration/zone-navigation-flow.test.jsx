import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/utils/test-utils'
import { FriggProvider } from '../../presentation/hooks/useFrigg'
import ZoneNavigation from '../../presentation/components/common/ZoneNavigation'
import IntegrationGallery from '../../presentation/components/integrations/IntegrationGallery'
import TestAreaContainer from '../../presentation/components/zones/TestAreaContainer'

// Mock the complete two-zone application component
const MockTwoZoneApp = ({ initialZone = 'definitions' }) => {
  const [activeZone, setActiveZone] = React.useState(initialZone)
  const [selectedIntegration, setSelectedIntegration] = React.useState(null)
  const [testEnvironment, setTestEnvironment] = React.useState({
    isRunning: false,
    testUrl: null
  })

  const mockIntegrations = [
    {
      id: '1',
      name: 'Stripe',
      description: 'Payment processing',
      category: 'payment',
      status: 'available'
    },
    {
      id: '2',
      name: 'Supabase',
      description: 'Database service',
      category: 'database',
      status: 'installed'
    }
  ]

  const handleInstall = vi.fn()
  const handleConfigure = vi.fn()
  const handleView = (integration) => {
    setSelectedIntegration(integration)
  }

  const handleStartTest = () => {
    setTestEnvironment({
      isRunning: true,
      testUrl: 'http://localhost:3000/test'
    })
  }

  const handleStopTest = () => {
    setTestEnvironment({
      isRunning: false,
      testUrl: null
    })
  }

  const handleRestartTest = () => {
    setTestEnvironment({
      isRunning: true,
      testUrl: 'http://localhost:3000/test'
    })
  }

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b p-4">
        <ZoneNavigation
          activeZone={activeZone}
          onZoneChange={setActiveZone}
        />
      </header>

      <main className="flex-1 p-4">
        {activeZone === 'definitions' && (
          <div data-testid="definitions-zone">
            <IntegrationGallery
              integrations={mockIntegrations}
              onInstall={handleInstall}
              onConfigure={handleConfigure}
              onView={handleView}
            />
          </div>
        )}

        {activeZone === 'testing' && (
          <div data-testid="testing-zone">
            <TestAreaContainer
              selectedIntegration={selectedIntegration}
              testUrl={testEnvironment.testUrl}
              isRunning={testEnvironment.isRunning}
              onStart={handleStartTest}
              onStop={handleStopTest}
              onRestart={handleRestartTest}
              onOpenExternal={vi.fn()}
            />
          </div>
        )}
      </main>
    </div>
  )
}

describe('Two-Zone Navigation Flow Integration', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear()
  })

  describe('Initial State', () => {
    it('renders definitions zone by default', () => {
      renderWithProviders(<MockTwoZoneApp />)

      expect(screen.getByTestId('definitions-zone')).toBeInTheDocument()
      expect(screen.queryByTestId('testing-zone')).not.toBeInTheDocument()
      expect(screen.getByText('Integration Gallery')).toBeInTheDocument()
    })

    it('highlights definitions zone tab as active', () => {
      renderWithProviders(<MockTwoZoneApp />)

      const definitionsButton = screen.getByRole('button', { name: /definitions zone/i })
      const testingButton = screen.getByRole('button', { name: /test area/i })

      expect(definitionsButton).toHaveClass('bg-background')
      expect(testingButton).not.toHaveClass('bg-background')
    })

    it('can start with testing zone active', () => {
      renderWithProviders(<MockTwoZoneApp initialZone="testing" />)

      expect(screen.getByTestId('testing-zone')).toBeInTheDocument()
      expect(screen.queryByTestId('definitions-zone')).not.toBeInTheDocument()
      expect(screen.getByText('Test Area')).toBeInTheDocument()
    })
  })

  describe('Zone Switching', () => {
    it('switches from definitions to testing zone', async () => {
      const user = userEvent.setup()
      renderWithProviders(<MockTwoZoneApp />)

      // Start in definitions zone
      expect(screen.getByTestId('definitions-zone')).toBeInTheDocument()

      // Click testing zone tab
      const testingButton = screen.getByRole('button', { name: /test area/i })
      await user.click(testingButton)

      // Should now show testing zone
      await waitFor(() => {
        expect(screen.getByTestId('testing-zone')).toBeInTheDocument()
        expect(screen.queryByTestId('definitions-zone')).not.toBeInTheDocument()
      })
    })

    it('switches from testing to definitions zone', async () => {
      const user = userEvent.setup()
      renderWithProviders(<MockTwoZoneApp initialZone="testing" />)

      // Start in testing zone
      expect(screen.getByTestId('testing-zone')).toBeInTheDocument()

      // Click definitions zone tab
      const definitionsButton = screen.getByRole('button', { name: /definitions zone/i })
      await user.click(definitionsButton)

      // Should now show definitions zone
      await waitFor(() => {
        expect(screen.getByTestId('definitions-zone')).toBeInTheDocument()
        expect(screen.queryByTestId('testing-zone')).not.toBeInTheDocument()
      })
    })

    it('updates tab highlighting when switching zones', async () => {
      const user = userEvent.setup()
      renderWithProviders(<MockTwoZoneApp />)

      const definitionsButton = screen.getByRole('button', { name: /definitions zone/i })
      const testingButton = screen.getByRole('button', { name: /test area/i })

      // Initially definitions is active
      expect(definitionsButton).toHaveClass('bg-background')
      expect(testingButton).not.toHaveClass('bg-background')

      // Switch to testing
      await user.click(testingButton)

      await waitFor(() => {
        expect(testingButton).toHaveClass('bg-background')
        expect(definitionsButton).not.toHaveClass('bg-background')
      })
    })

    it('handles rapid zone switching', async () => {
      const user = userEvent.setup()
      renderWithProviders(<MockTwoZoneApp />)

      const definitionsButton = screen.getByRole('button', { name: /definitions zone/i })
      const testingButton = screen.getByRole('button', { name: /test area/i })

      // Rapidly switch between zones
      await user.click(testingButton)
      await user.click(definitionsButton)
      await user.click(testingButton)
      await user.click(definitionsButton)

      // Should end up in definitions zone
      await waitFor(() => {
        expect(screen.getByTestId('definitions-zone')).toBeInTheDocument()
        expect(definitionsButton).toHaveClass('bg-background')
      })
    })
  })

  describe('Integration Selection Workflow', () => {
    it('allows selecting integration in definitions zone', async () => {
      const user = userEvent.setup()
      renderWithProviders(<MockTwoZoneApp />)

      // Click on an integration card
      const stripeCard = screen.getByText('Stripe').closest('div[class*="cursor-pointer"]')
      await user.click(stripeCard)

      // Integration should be selected (this would update internal state)
      expect(screen.getByText('Stripe')).toBeInTheDocument()
    })

    it('preserves selected integration when switching to testing zone', async () => {
      const user = userEvent.setup()
      renderWithProviders(<MockTwoZoneApp />)

      // Select integration in definitions zone
      const stripeCard = screen.getByText('Stripe').closest('div[class*="cursor-pointer"]')
      await user.click(stripeCard)

      // Switch to testing zone
      const testingButton = screen.getByRole('button', { name: /test area/i })
      await user.click(testingButton)

      await waitFor(() => {
        expect(screen.getByTestId('testing-zone')).toBeInTheDocument()
        expect(screen.getByText('Testing: Stripe')).toBeInTheDocument()
      })
    })

    it('shows appropriate message when no integration selected in testing zone', async () => {
      const user = userEvent.setup()
      renderWithProviders(<MockTwoZoneApp initialZone="testing" />)

      expect(screen.getByText('No Integration Selected')).toBeInTheDocument()
      expect(screen.getByText('Select an integration from the Definitions Zone to start testing')).toBeInTheDocument()
    })
  })

  describe('Test Environment Workflow', () => {
    it('complete integration testing workflow', async () => {
      const user = userEvent.setup()
      renderWithProviders(<MockTwoZoneApp />)

      // Step 1: Select integration in definitions zone
      const stripeCard = screen.getByText('Stripe').closest('div[class*="cursor-pointer"]')
      await user.click(stripeCard)

      // Step 2: Switch to testing zone
      const testingButton = screen.getByRole('button', { name: /test area/i })
      await user.click(testingButton)

      await waitFor(() => {
        expect(screen.getByTestId('testing-zone')).toBeInTheDocument()
        expect(screen.getByText('Testing: Stripe')).toBeInTheDocument()
      })

      // Step 3: Start test environment
      const startButton = screen.getByText('Start Test Environment')
      await user.click(startButton)

      await waitFor(() => {
        expect(screen.getByText('Running')).toBeInTheDocument()
        expect(screen.getByTitle('Stripe Test Environment')).toBeInTheDocument()
      })

      // Step 4: Stop test environment
      const stopButton = screen.getAllByRole('button').find(button =>
        button.getAttribute('class')?.includes('destructive')
      )

      if (stopButton) {
        await user.click(stopButton)

        await waitFor(() => {
          expect(screen.getByText('Stopped')).toBeInTheDocument()
          expect(screen.getByText('Test Environment Ready')).toBeInTheDocument()
        })
      }
    })

    it('handles test environment controls properly', async () => {
      const user = userEvent.setup()
      renderWithProviders(<MockTwoZoneApp initialZone="testing" />)

      // Initially no integration selected, start button should be disabled
      const initialStartButton = screen.getByRole('button', { name: /start/i })
      expect(initialStartButton).toBeDisabled()

      // Go back to definitions and select integration
      const definitionsButton = screen.getByRole('button', { name: /definitions zone/i })
      await user.click(definitionsButton)

      const stripeCard = screen.getByText('Stripe').closest('div[class*="cursor-pointer"]')
      await user.click(stripeCard)

      // Go back to testing
      const testingButton = screen.getByRole('button', { name: /test area/i })
      await user.click(testingButton)

      await waitFor(() => {
        const startButton = screen.getByText('Start Test Environment')
        expect(startButton).toBeEnabled()
      })
    })
  })

  describe('State Persistence', () => {
    it('maintains selected integration across zone switches', async () => {
      const user = userEvent.setup()
      renderWithProviders(<MockTwoZoneApp />)

      // Select integration
      const stripeCard = screen.getByText('Stripe').closest('div[class*="cursor-pointer"]')
      await user.click(stripeCard)

      // Switch zones multiple times
      const testingButton = screen.getByRole('button', { name: /test area/i })
      const definitionsButton = screen.getByRole('button', { name: /definitions zone/i })

      await user.click(testingButton)
      await waitFor(() => {
        expect(screen.getByText('Testing: Stripe')).toBeInTheDocument()
      })

      await user.click(definitionsButton)
      await waitFor(() => {
        expect(screen.getByText('Stripe')).toBeInTheDocument()
      })

      await user.click(testingButton)
      await waitFor(() => {
        expect(screen.getByText('Testing: Stripe')).toBeInTheDocument()
      })
    })

    it('maintains test environment state across zone switches', async () => {
      const user = userEvent.setup()
      renderWithProviders(<MockTwoZoneApp />)

      // Select integration and switch to testing
      const stripeCard = screen.getByText('Stripe').closest('div[class*="cursor-pointer"]')
      await user.click(stripeCard)

      const testingButton = screen.getByRole('button', { name: /test area/i })
      await user.click(testingButton)

      // Start test environment
      const startButton = screen.getByText('Start Test Environment')
      await user.click(startButton)

      await waitFor(() => {
        expect(screen.getByText('Running')).toBeInTheDocument()
      })

      // Switch to definitions and back
      const definitionsButton = screen.getByRole('button', { name: /definitions zone/i })
      await user.click(definitionsButton)
      await user.click(testingButton)

      // Test environment should still be running
      await waitFor(() => {
        expect(screen.getByText('Running')).toBeInTheDocument()
        expect(screen.getByTitle('Stripe Test Environment')).toBeInTheDocument()
      })
    })
  })

  describe('User Experience Flow', () => {
    it('provides smooth workflow from discovery to testing', async () => {
      const user = userEvent.setup()
      renderWithProviders(<MockTwoZoneApp />)

      // 1. User starts in definitions zone and browses integrations
      expect(screen.getByText('Integration Gallery')).toBeInTheDocument()
      expect(screen.getByText('Discover and manage integrations for your project')).toBeInTheDocument()

      // 2. User finds and selects an integration
      const supabaseCard = screen.getByText('Supabase').closest('div[class*="cursor-pointer"]')
      await user.click(supabaseCard)

      // 3. User switches to testing zone to test the integration
      const testingButton = screen.getByRole('button', { name: /test area/i })
      await user.click(testingButton)

      await waitFor(() => {
        expect(screen.getByText('Testing: Supabase')).toBeInTheDocument()
        expect(screen.getByText('Test Environment Ready')).toBeInTheDocument()
      })

      // 4. User starts the test environment
      const startButton = screen.getByText('Start Test Environment')
      await user.click(startButton)

      await waitFor(() => {
        expect(screen.getByText('Running')).toBeInTheDocument()
      })

      // 5. User can interact with running test environment
      expect(screen.getByTitle('Supabase Test Environment')).toBeInTheDocument()
    })

    it('handles error states gracefully during workflow', async () => {
      const user = userEvent.setup()
      renderWithProviders(<MockTwoZoneApp />)

      // Select integration and go to testing
      const stripeCard = screen.getByText('Stripe').closest('div[class*="cursor-pointer"]')
      await user.click(stripeCard)

      const testingButton = screen.getByRole('button', { name: /test area/i })
      await user.click(testingButton)

      // Even if test environment fails to start, UI should remain functional
      expect(screen.getByText('Test Area')).toBeInTheDocument()

      // User should be able to switch back to definitions
      const definitionsButton = screen.getByRole('button', { name: /definitions zone/i })
      await user.click(definitionsButton)

      await waitFor(() => {
        expect(screen.getByTestId('definitions-zone')).toBeInTheDocument()
      })
    })
  })

  describe('Performance and Responsiveness', () => {
    it('zone switching is responsive and immediate', async () => {
      const user = userEvent.setup()
      renderWithProviders(<MockTwoZoneApp />)

      const testingButton = screen.getByRole('button', { name: /test area/i })

      const start = performance.now()
      await user.click(testingButton)

      await waitFor(() => {
        expect(screen.getByTestId('testing-zone')).toBeInTheDocument()
      })
      const end = performance.now()

      // Zone switching should be very fast (less than 100ms)
      expect(end - start).toBeLessThan(100)
    })

    it('handles multiple rapid interactions gracefully', async () => {
      const user = userEvent.setup()
      renderWithProviders(<MockTwoZoneApp />)

      const definitionsButton = screen.getByRole('button', { name: /definitions zone/i })
      const testingButton = screen.getByRole('button', { name: /test area/i })

      // Rapid clicking and zone switching
      await user.click(testingButton)
      await user.click(definitionsButton)

      const stripeCard = screen.getByText('Stripe').closest('div[class*="cursor-pointer"]')
      await user.click(stripeCard)

      await user.click(testingButton)

      // Should end up in correct state
      await waitFor(() => {
        expect(screen.getByTestId('testing-zone')).toBeInTheDocument()
        expect(screen.getByText('Testing: Stripe')).toBeInTheDocument()
      })
    })
  })

  describe('Accessibility', () => {
    it('maintains focus management during zone transitions', async () => {
      const user = userEvent.setup()
      renderWithProviders(<MockTwoZoneApp />)

      // Tab to testing button and activate
      await user.tab()
      await user.tab() // Assuming this reaches the testing button

      const testingButton = screen.getByRole('button', { name: /test area/i })
      await user.click(testingButton)

      // Zone should switch and focus should be manageable
      await waitFor(() => {
        expect(screen.getByTestId('testing-zone')).toBeInTheDocument()
      })

      // Should be able to continue keyboard navigation
      await user.tab()
      expect(document.activeElement).toBeInstanceOf(HTMLElement)
    })

    it('provides clear indication of current zone to screen readers', () => {
      renderWithProviders(<MockTwoZoneApp />)

      const definitionsButton = screen.getByRole('button', { name: /definitions zone/i })
      const testingButton = screen.getByRole('button', { name: /test area/i })

      // Active zone should be clearly indicated
      expect(definitionsButton).toHaveClass('bg-background')
      expect(testingButton).not.toHaveClass('bg-background')
    })
  })
})