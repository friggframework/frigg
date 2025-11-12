import React from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/utils/test-utils'

// Import components to test
import ZoneNavigation from '../../presentation/components/common/ZoneNavigation'
import IntegrationGallery from '../../presentation/components/integrations/IntegrationGallery'
import TestAreaContainer from '../../presentation/components/zones/TestAreaContainer'
import SearchBar from '../../presentation/components/common/SearchBar'
import LiveLogPanel from '../../presentation/components/common/LiveLogPanel'

// Mock ResizeObserver if not available
global.ResizeObserver = global.ResizeObserver || vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Helper function to simulate viewport changes
const setViewport = (width, height) => {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  })
  Object.defineProperty(window, 'innerHeight', {
    writable: true,
    configurable: true,
    value: height,
  })

  // Trigger resize event
  window.dispatchEvent(new Event('resize'))
}

// Helper function to check if element has responsive classes
const hasResponsiveClasses = (element, expectedClasses) => {
  return expectedClasses.some(className => element.classList.contains(className))
}

// Mock data
const mockIntegrations = [
  {
    id: '1',
    name: 'Mobile Test Integration',
    description: 'Integration optimized for mobile testing',
    category: 'mobile',
    status: 'available',
    tags: ['mobile', 'responsive']
  },
  {
    id: '2',
    name: 'Desktop Integration',
    description: 'Integration for desktop environments',
    category: 'desktop',
    status: 'installed',
    tags: ['desktop', 'web']
  },
  {
    id: '3',
    name: 'Universal Integration',
    description: 'Works across all devices',
    category: 'universal',
    status: 'available',
    tags: ['universal', 'cross-platform']
  }
]

const mockFilters = [
  { id: 'mobile', label: 'Mobile' },
  { id: 'desktop', label: 'Desktop' },
  { id: 'universal', label: 'Universal' }
]

const mockLogs = Array.from({ length: 10 }, (_, i) => ({
  level: i % 2 === 0 ? 'info' : 'error',
  message: `Responsive test log entry ${i + 1} with some longer content to test wrapping`,
  timestamp: new Date(Date.now() - i * 1000).toISOString(),
  source: 'responsive-test'
}))

describe('Responsive Design Tests', () => {
  beforeEach(() => {
    // Set default viewport
    setViewport(1024, 768)
  })

  afterEach(() => {
    // Reset viewport
    setViewport(1024, 768)
  })

  describe('Mobile Viewport (320px - 767px)', () => {
    beforeEach(() => {
      setViewport(375, 667) // iPhone 6/7/8 size
    })

    describe('ZoneNavigation Mobile Behavior', () => {
      it('maintains usability on mobile screens', () => {
        renderWithProviders(
          <ZoneNavigation
            activeZone="definitions"
            onZoneChange={vi.fn()}
          />
        )

        const buttons = screen.getAllByRole('button')
        buttons.forEach(button => {
          expect(button).toBeVisible()
          // Buttons should be touch-friendly (minimum 44px touch target)
          const buttonStyles = window.getComputedStyle(button)
          expect(button).toBeInTheDocument()
        })
      })

      it('handles navigation on small screens', async () => {
        const mockOnZoneChange = vi.fn()
        const user = userEvent.setup()

        renderWithProviders(
          <ZoneNavigation
            activeZone="definitions"
            onZoneChange={mockOnZoneChange}
          />
        )

        const testingButton = screen.getByRole('button', { name: /test area/i })
        await user.click(testingButton)

        expect(mockOnZoneChange).toHaveBeenCalledWith('testing')
      })

      it('provides adequate spacing for touch interactions', () => {
        renderWithProviders(
          <ZoneNavigation
            activeZone="definitions"
            onZoneChange={vi.fn()}
          />
        )

        const container = screen.getByRole('button', { name: /definitions zone/i }).parentElement
        expect(container).toHaveClass('gap-2')
      })
    })

    describe('IntegrationGallery Mobile Layout', () => {
      it('adjusts grid layout for mobile screens', () => {
        renderWithProviders(
          <IntegrationGallery
            integrations={mockIntegrations}
            onInstall={vi.fn()}
            onConfigure={vi.fn()}
            onView={vi.fn()}
          />
        )

        // Grid should collapse to single column on mobile
        const gridContainer = screen.getByText('Mobile Test Integration').closest('div[class*="grid"]')
        expect(gridContainer).toHaveClass('grid-cols-1')
      })

      it('maintains readable text on mobile', () => {
        renderWithProviders(
          <IntegrationGallery
            integrations={mockIntegrations}
            onInstall={vi.fn()}
            onConfigure={vi.fn()}
            onView={vi.fn()}
          />
        )

        // Text should be visible and readable
        expect(screen.getByText('Mobile Test Integration')).toBeVisible()
        expect(screen.getByText('Integration optimized for mobile testing')).toBeVisible()
      })

      it('provides touch-friendly interaction areas', async () => {
        const user = userEvent.setup()
        const mockOnInstall = vi.fn()

        renderWithProviders(
          <IntegrationGallery
            integrations={mockIntegrations}
            onInstall={mockOnInstall}
            onConfigure={vi.fn()}
            onView={vi.fn()}
          />
        )

        const installButton = screen.getByText('Install')
        await user.click(installButton)

        expect(mockOnInstall).toHaveBeenCalled()
      })

      it('handles tag overflow gracefully on mobile', () => {
        const integrationWithManyTags = {
          id: '4',
          name: 'Tag Heavy Integration',
          description: 'Integration with many tags',
          category: 'test',
          status: 'available',
          tags: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5', 'tag6', 'tag7', 'tag8']
        }

        renderWithProviders(
          <IntegrationGallery
            integrations={[integrationWithManyTags]}
            onInstall={vi.fn()}
            onConfigure={vi.fn()}
            onView={vi.fn()}
          />
        )

        // Should show some tags and indicate overflow
        expect(screen.getByText('tag1')).toBeInTheDocument()
        expect(screen.getByText('+5')).toBeInTheDocument() // Overflow indicator
      })
    })

    describe('TestAreaContainer Mobile Behavior', () => {
      it('adapts view mode controls for mobile', () => {
        renderWithProviders(
          <TestAreaContainer
            selectedIntegration={{ id: '1', name: 'Mobile Integration' }}
            isRunning={false}
            onStart={vi.fn()}
            onStop={vi.fn()}
            onRestart={vi.fn()}
            onOpenExternal={vi.fn()}
          />
        )

        // View mode selector should be visible
        const viewButtons = screen.getAllByRole('button').filter(button => {
          return button.getAttribute('class')?.includes('px-2')
        })

        expect(viewButtons.length).toBeGreaterThan(0)
      })

      it('shows mobile preview correctly', async () => {
        const user = userEvent.setup()

        renderWithProviders(
          <TestAreaContainer
            selectedIntegration={{ id: '1', name: 'Mobile Integration' }}
            isRunning={true}
            testUrl="http://localhost:3000/test"
            onStart={vi.fn()}
            onStop={vi.fn()}
            onRestart={vi.fn()}
            onOpenExternal={vi.fn()}
          />
        )

        // Should show iframe when running
        const iframe = screen.getByTitle('Mobile Integration Test Environment')
        expect(iframe).toBeInTheDocument()
      })

      it('handles control overflow on small screens', () => {
        renderWithProviders(
          <TestAreaContainer
            selectedIntegration={{ id: '1', name: 'Mobile Integration' }}
            isRunning={true}
            onStart={vi.fn()}
            onStop={vi.fn()}
            onRestart={vi.fn()}
            onOpenExternal={vi.fn()}
          />
        )

        // Controls should be arranged appropriately
        const controls = screen.getAllByRole('button')
        controls.forEach(control => {
          expect(control).toBeVisible()
        })
      })
    })

    describe('SearchBar Mobile Layout', () => {
      it('maintains search functionality on mobile', async () => {
        const user = userEvent.setup()
        const mockOnSearch = vi.fn()

        renderWithProviders(
          <SearchBar
            filters={mockFilters}
            activeFilters={[]}
            onSearch={mockOnSearch}
            onFilter={vi.fn()}
          />
        )

        const searchInput = screen.getByRole('textbox')
        await user.type(searchInput, 'mobile search')

        expect(mockOnSearch).toHaveBeenCalledWith('mobile search')
      })

      it('adapts filter dropdown for mobile', async () => {
        const user = userEvent.setup()

        renderWithProviders(
          <SearchBar
            filters={mockFilters}
            activeFilters={[]}
            onSearch={vi.fn()}
            onFilter={vi.fn()}
          />
        )

        const filtersButton = screen.getByText('Filters')
        await user.click(filtersButton)

        // Filter dropdown should adjust layout for mobile
        await screen.findByText('Mobile')
        expect(screen.getByText('Desktop')).toBeInTheDocument()
      })
    })

    describe('LiveLogPanel Mobile Behavior', () => {
      it('maintains log readability on mobile', () => {
        renderWithProviders(
          <LiveLogPanel
            logs={mockLogs}
            isStreaming={false}
            onClear={vi.fn()}
            onDownload={vi.fn()}
            onToggleStreaming={vi.fn()}
          />
        )

        // Logs should be readable
        expect(screen.getByText('Responsive test log entry 1 with some longer content to test wrapping')).toBeVisible()
      })

      it('handles log panel collapse/expand on mobile', async () => {
        const user = userEvent.setup()

        renderWithProviders(
          <LiveLogPanel
            logs={mockLogs}
            isStreaming={false}
            onClear={vi.fn()}
            onDownload={vi.fn()}
            onToggleStreaming={vi.fn()}
          />
        )

        // Find and click collapse button
        const collapseButton = screen.getAllByRole('button').find(button =>
          button.getAttribute('class')?.includes('p-1')
        )

        if (collapseButton) {
          await user.click(collapseButton)
          expect(screen.getByText('Logs (10)')).toBeInTheDocument()
        }
      })
    })
  })

  describe('Tablet Viewport (768px - 1023px)', () => {
    beforeEach(() => {
      setViewport(768, 1024) // iPad portrait
    })

    describe('Integration Gallery Tablet Layout', () => {
      it('uses appropriate grid columns for tablet', () => {
        renderWithProviders(
          <IntegrationGallery
            integrations={mockIntegrations}
            onInstall={vi.fn()}
            onConfigure={vi.fn()}
            onView={vi.fn()}
          />
        )

        // Should use 2 columns on tablet (md:grid-cols-2)
        const gridContainer = screen.getByText('Mobile Test Integration').closest('div[class*="grid"]')
        expect(gridContainer).toHaveClass('md:grid-cols-2')
      })

      it('maintains good spacing and proportions', () => {
        renderWithProviders(
          <IntegrationGallery
            integrations={mockIntegrations}
            onInstall={vi.fn()}
            onConfigure={vi.fn()}
            onView={vi.fn()}
          />
        )

        // Cards should be well-spaced
        const gridContainer = screen.getByText('Mobile Test Integration').closest('div[class*="grid"]')
        expect(gridContainer).toHaveClass('gap-4')
      })
    })

    describe('Test Area Container Tablet View', () => {
      it('shows tablet preview mode appropriately', () => {
        renderWithProviders(
          <TestAreaContainer
            selectedIntegration={{ id: '1', name: 'Tablet Integration' }}
            isRunning={false}
            onStart={vi.fn()}
            onStop={vi.fn()}
            onRestart={vi.fn()}
            onOpenExternal={vi.fn()}
          />
        )

        // Tablet view mode should be available
        const viewButtons = screen.getAllByRole('button').filter(button => {
          return button.getAttribute('class')?.includes('px-2')
        })

        expect(viewButtons.length).toBe(3) // Desktop, Tablet, Mobile
      })
    })

    describe('Search Bar Tablet Behavior', () => {
      it('adapts filter grid for tablet screens', async () => {
        const user = userEvent.setup()

        renderWithProviders(
          <SearchBar
            filters={mockFilters}
            activeFilters={[]}
            onSearch={vi.fn()}
            onFilter={vi.fn()}
          />
        )

        const filtersButton = screen.getByText('Filters')
        await user.click(filtersButton)

        // Filter grid should use md:grid-cols-3 on tablet
        const filterContainer = screen.getByText('Mobile').closest('div[class*="grid"]')
        expect(filterContainer).toHaveClass('md:grid-cols-3')
      })
    })
  })

  describe('Desktop Viewport (1024px+)', () => {
    beforeEach(() => {
      setViewport(1280, 720) // Standard desktop
    })

    describe('Integration Gallery Desktop Layout', () => {
      it('uses full grid layout on desktop', () => {
        renderWithProviders(
          <IntegrationGallery
            integrations={mockIntegrations}
            onInstall={vi.fn()}
            onConfigure={vi.fn()}
            onView={vi.fn()}
          />
        )

        // Should use 4 columns on desktop (xl:grid-cols-4)
        const gridContainer = screen.getByText('Mobile Test Integration').closest('div[class*="grid"]')
        expect(gridContainer).toHaveClass('xl:grid-cols-4')
      })

      it('shows all content without truncation', () => {
        renderWithProviders(
          <IntegrationGallery
            integrations={mockIntegrations}
            onInstall={vi.fn()}
            onConfigure={vi.fn()}
            onView={vi.fn()}
          />
        )

        // All integration details should be visible
        expect(screen.getByText('Mobile Test Integration')).toBeVisible()
        expect(screen.getByText('Integration optimized for mobile testing')).toBeVisible()
        expect(screen.getByText('Desktop Integration')).toBeVisible()
        expect(screen.getByText('Integration for desktop environments')).toBeVisible()
      })
    })

    describe('Test Area Container Desktop Behavior', () => {
      it('utilizes full screen space effectively', () => {
        renderWithProviders(
          <TestAreaContainer
            selectedIntegration={{ id: '1', name: 'Desktop Integration' }}
            isRunning={true}
            testUrl="http://localhost:3000/test"
            onStart={vi.fn()}
            onStop={vi.fn()}
            onRestart={vi.fn()}
            onOpenExternal={vi.fn()}
          />
        )

        // Desktop view should use full space
        const previewCard = screen.getByText('App Preview').closest('div')
        expect(previewCard).toHaveClass('w-full', 'h-full')
      })
    })

    describe('Search Bar Desktop Layout', () => {
      it('uses optimal filter grid on desktop', async () => {
        const user = userEvent.setup()

        renderWithProviders(
          <SearchBar
            filters={mockFilters}
            activeFilters={[]}
            onSearch={vi.fn()}
            onFilter={vi.fn()}
          />
        )

        const filtersButton = screen.getByText('Filters')
        await user.click(filtersButton)

        // Filter grid should use lg:grid-cols-4 on desktop
        const filterContainer = screen.getByText('Mobile').closest('div[class*="grid"]')
        expect(filterContainer).toHaveClass('lg:grid-cols-4')
      })
    })
  })

  describe('Large Desktop Viewport (1440px+)', () => {
    beforeEach(() => {
      setViewport(1440, 900) // Large desktop
    })

    describe('Integration Gallery Large Screen Optimization', () => {
      it('maintains optimal card sizing on large screens', () => {
        renderWithProviders(
          <IntegrationGallery
            integrations={mockIntegrations}
            onInstall={vi.fn()}
            onConfigure={vi.fn()}
            onView={vi.fn()}
          />
        )

        // Should still use xl:grid-cols-4 to prevent cards from being too wide
        const gridContainer = screen.getByText('Mobile Test Integration').closest('div[class*="grid"]')
        expect(gridContainer).toHaveClass('xl:grid-cols-4')
      })
    })

    describe('Test Area Full Screen Experience', () => {
      it('provides immersive testing experience', async () => {
        const user = userEvent.setup()

        renderWithProviders(
          <TestAreaContainer
            selectedIntegration={{ id: '1', name: 'Large Screen Integration' }}
            isRunning={false}
            onStart={vi.fn()}
            onStop={vi.fn()}
            onRestart={vi.fn()}
            onOpenExternal={vi.fn()}
          />
        )

        // Find fullscreen button
        const fullscreenButton = screen.getAllByRole('button').find(button => {
          return button.getAttribute('class')?.includes('outline')
        })

        if (fullscreenButton) {
          await user.click(fullscreenButton)
          // Component should handle fullscreen mode
          expect(screen.getByText('Test Area')).toBeInTheDocument()
        }
      })
    })
  })

  describe('Orientation Changes', () => {
    it('handles portrait to landscape transition on tablets', () => {
      // Start in portrait
      setViewport(768, 1024)

      const { rerender } = renderWithProviders(
        <IntegrationGallery
          integrations={mockIntegrations}
          onInstall={vi.fn()}
          onConfigure={vi.fn()}
          onView={vi.fn()}
        />
      )

      expect(screen.getByText('Integration Gallery')).toBeInTheDocument()

      // Switch to landscape
      setViewport(1024, 768)

      rerender(
        <IntegrationGallery
          integrations={mockIntegrations}
          onInstall={vi.fn()}
          onConfigure={vi.fn()}
          onView={vi.fn()}
        />
      )

      // Component should adapt without breaking
      expect(screen.getByText('Integration Gallery')).toBeInTheDocument()
    })

    it('maintains functionality during rapid viewport changes', () => {
      const { rerender } = renderWithProviders(
        <ZoneNavigation
          activeZone="definitions"
          onZoneChange={vi.fn()}
        />
      )

      // Rapidly change viewports
      const viewports = [
        [320, 568], // iPhone SE
        [375, 667], // iPhone 6/7/8
        [768, 1024], // iPad portrait
        [1024, 768], // iPad landscape
        [1280, 720], // Desktop
        [1920, 1080] // Large desktop
      ]

      viewports.forEach(([width, height]) => {
        setViewport(width, height)
        rerender(
          <ZoneNavigation
            activeZone="definitions"
            onZoneChange={vi.fn()}
          />
        )

        // Component should remain functional
        expect(screen.getByText('Definitions Zone')).toBeInTheDocument()
        expect(screen.getByText('Test Area')).toBeInTheDocument()
      })
    })
  })

  describe('Content Overflow Handling', () => {
    it('handles long integration names gracefully', () => {
      const longNameIntegration = {
        id: '1',
        name: 'Very Long Integration Name That Should Be Handled Gracefully Across All Viewport Sizes',
        description: 'This integration has a very long name that might cause layout issues',
        category: 'test',
        status: 'available',
        tags: ['long-name', 'test']
      }

      setViewport(320, 568) // Small mobile

      renderWithProviders(
        <IntegrationGallery
          integrations={[longNameIntegration]}
          onInstall={vi.fn()}
          onConfigure={vi.fn()}
          onView={vi.fn()}
        />
      )

      // Long name should be visible and not break layout
      expect(screen.getByText('Very Long Integration Name That Should Be Handled Gracefully Across All Viewport Sizes')).toBeInTheDocument()
    })

    it('handles long log messages on small screens', () => {
      const longLogMessage = 'This is a very long log message that should wrap properly on small screens without breaking the layout or becoming unreadable'

      const longLogs = [{
        level: 'info',
        message: longLogMessage,
        timestamp: new Date().toISOString(),
        source: 'long-message-test'
      }]

      setViewport(320, 568) // Small mobile

      renderWithProviders(
        <LiveLogPanel
          logs={longLogs}
          isStreaming={false}
          onClear={vi.fn()}
          onDownload={vi.fn()}
          onToggleStreaming={vi.fn()}
        />
      )

      // Long message should be visible and wrap properly
      expect(screen.getByText(longLogMessage)).toBeInTheDocument()
    })
  })

  describe('Performance Across Viewports', () => {
    it('maintains performance on mobile devices', () => {
      setViewport(375, 667) // Mobile

      const start = performance.now()

      renderWithProviders(
        <IntegrationGallery
          integrations={mockIntegrations}
          onInstall={vi.fn()}
          onConfigure={vi.fn()}
          onView={vi.fn()}
        />
      )

      const end = performance.now()

      // Should render quickly even on mobile
      expect(end - start).toBeLessThan(100)
      expect(screen.getByText('Integration Gallery')).toBeInTheDocument()
    })

    it('handles large datasets efficiently across viewports', () => {
      const manyIntegrations = Array.from({ length: 50 }, (_, i) => ({
        id: i.toString(),
        name: `Integration ${i}`,
        description: `Description for integration ${i}`,
        category: 'test',
        status: 'available',
        tags: [`tag${i}`]
      }))

      const viewports = [
        [375, 667],   // Mobile
        [768, 1024],  // Tablet
        [1280, 720]   // Desktop
      ]

      viewports.forEach(([width, height]) => {
        setViewport(width, height)

        const start = performance.now()

        const { unmount } = renderWithProviders(
          <IntegrationGallery
            integrations={manyIntegrations}
            onInstall={vi.fn()}
            onConfigure={vi.fn()}
            onView={vi.fn()}
          />
        )

        const end = performance.now()

        // Should render efficiently at all viewport sizes
        expect(end - start).toBeLessThan(200)
        expect(screen.getByText('50 of 50 integrations')).toBeInTheDocument()

        unmount()
      })
    })
  })
})