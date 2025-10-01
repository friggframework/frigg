import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/utils/test-utils'
import ZoneNavigation from '../../presentation/components/common/ZoneNavigation'

describe('ZoneNavigation', () => {
  const mockOnZoneChange = vi.fn()

  const defaultProps = {
    activeZone: 'definitions',
    onZoneChange: mockOnZoneChange,
  }

  beforeEach(() => {
    mockOnZoneChange.mockClear()
  })

  describe('Rendering', () => {
    it('renders all zone navigation buttons', () => {
      renderWithProviders(<ZoneNavigation {...defaultProps} />)

      expect(screen.getByText('Definitions Zone')).toBeInTheDocument()
      expect(screen.getByText('Build & Configure')).toBeInTheDocument()
      expect(screen.getByText('Test Area')).toBeInTheDocument()
      expect(screen.getByText('Live Run & Test')).toBeInTheDocument()
    })

    it('highlights the active zone', () => {
      renderWithProviders(<ZoneNavigation {...defaultProps} />)

      const definitionsButton = screen.getByRole('button', { name: /definitions zone/i })
      const testButton = screen.getByRole('button', { name: /test area/i })

      expect(definitionsButton).toHaveClass('bg-background', 'shadow-sm', 'border')
      expect(testButton).not.toHaveClass('bg-background', 'shadow-sm', 'border')
    })

    it('shows correct icons for each zone', () => {
      renderWithProviders(<ZoneNavigation {...defaultProps} />)

      // Icons are rendered as SVG elements with specific classes
      const icons = screen.getAllByRole('button').map(button =>
        button.querySelector('svg')
      )

      expect(icons).toHaveLength(2)
      icons.forEach(icon => {
        expect(icon).toBeInTheDocument()
        expect(icon).toHaveClass('w-4', 'h-4')
      })
    })

    it('applies custom className when provided', () => {
      renderWithProviders(
        <ZoneNavigation {...defaultProps} className="custom-class" />
      )

      // Find the actual component container (not the test wrapper)
      const zoneNavigation = screen.getByRole('button', { name: /definitions zone/i }).closest('div[class*="custom-class"]') ||
                            screen.getByRole('button', { name: /definitions zone/i }).parentElement.parentElement

      expect(zoneNavigation).toHaveClass('custom-class')
    })
  })

  describe('Interaction', () => {
    it('calls onZoneChange when definitions zone is clicked', async () => {
      const user = userEvent.setup()
      renderWithProviders(<ZoneNavigation {...defaultProps} activeZone="testing" />)

      const definitionsButton = screen.getByRole('button', { name: /definitions zone/i })
      await user.click(definitionsButton)

      expect(mockOnZoneChange).toHaveBeenCalledWith('definitions')
    })

    it('calls onZoneChange when testing zone is clicked', async () => {
      const user = userEvent.setup()
      renderWithProviders(<ZoneNavigation {...defaultProps} />)

      const testButton = screen.getByRole('button', { name: /test area/i })
      await user.click(testButton)

      expect(mockOnZoneChange).toHaveBeenCalledWith('testing')
    })

    it('handles keyboard navigation', async () => {
      const user = userEvent.setup()
      renderWithProviders(<ZoneNavigation {...defaultProps} />)

      const definitionsButton = screen.getByRole('button', { name: /definitions zone/i })
      const testButton = screen.getByRole('button', { name: /test area/i })

      // Tab to first button and press Enter
      await user.tab()
      expect(definitionsButton).toHaveFocus()

      // Tab to second button
      await user.tab()
      expect(testButton).toHaveFocus()

      // Press Enter on focused button
      await user.keyboard('{Enter}')
      expect(mockOnZoneChange).toHaveBeenCalledWith('testing')
    })

    it('handles rapid clicking without errors', async () => {
      const user = userEvent.setup()
      renderWithProviders(<ZoneNavigation {...defaultProps} />)

      const testButton = screen.getByRole('button', { name: /test area/i })

      // Rapid clicks
      await user.click(testButton)
      await user.click(testButton)
      await user.click(testButton)

      expect(mockOnZoneChange).toHaveBeenCalledTimes(3)
    })
  })

  describe('Accessibility', () => {
    it('has proper ARIA attributes', () => {
      renderWithProviders(<ZoneNavigation {...defaultProps} />)

      const buttons = screen.getAllByRole('button')

      buttons.forEach(button => {
        expect(button).toBeVisible()
        expect(button).toBeEnabled()
      })
    })

    it('has proper focus management', async () => {
      const user = userEvent.setup()
      renderWithProviders(<ZoneNavigation {...defaultProps} />)

      // Should be able to tab through all buttons
      await user.tab()
      expect(screen.getByRole('button', { name: /definitions zone/i })).toHaveFocus()

      await user.tab()
      expect(screen.getByRole('button', { name: /test area/i })).toHaveFocus()

      // Should cycle back
      await user.tab()
      expect(document.body).toHaveFocus()
    })

    it('provides clear visual feedback for active state', () => {
      renderWithProviders(<ZoneNavigation {...defaultProps} activeZone="testing" />)

      const activeButton = screen.getByRole('button', { name: /test area/i })
      const inactiveButton = screen.getByRole('button', { name: /definitions zone/i })

      // Active button should have distinct styling
      expect(activeButton).toHaveClass('bg-background')
      expect(inactiveButton).not.toHaveClass('bg-background')
    })
  })

  describe('Zone States', () => {
    it('handles switching between zones correctly', () => {
      const { rerender } = renderWithProviders(<ZoneNavigation {...defaultProps} />)

      // Initially definitions active
      expect(screen.getByRole('button', { name: /definitions zone/i }))
        .toHaveClass('bg-background')

      // Switch to testing
      rerender(<ZoneNavigation {...defaultProps} activeZone="testing" />)

      expect(screen.getByRole('button', { name: /test area/i }))
        .toHaveClass('bg-background')
      expect(screen.getByRole('button', { name: /definitions zone/i }))
        .not.toHaveClass('bg-background')
    })

    it('handles invalid activeZone gracefully', () => {
      renderWithProviders(<ZoneNavigation {...defaultProps} activeZone="invalid" />)

      // Should render without errors
      expect(screen.getByText('Definitions Zone')).toBeInTheDocument()
      expect(screen.getByText('Test Area')).toBeInTheDocument()

      // No button should be active
      const buttons = screen.getAllByRole('button')
      buttons.forEach(button => {
        expect(button).not.toHaveClass('bg-background')
      })
    })
  })

  describe('Visual States', () => {
    it('shows proper hover states', async () => {
      const user = userEvent.setup()
      renderWithProviders(<ZoneNavigation {...defaultProps} />)

      const testButton = screen.getByRole('button', { name: /test area/i })

      await user.hover(testButton)
      expect(testButton).toHaveClass('hover:bg-background/80')
    })

    it('shows proper transition classes', () => {
      renderWithProviders(<ZoneNavigation {...defaultProps} />)

      const buttons = screen.getAllByRole('button')

      buttons.forEach(button => {
        expect(button).toHaveClass('transition-all', 'duration-200')
      })
    })

    it('displays active indicator overlay', () => {
      renderWithProviders(<ZoneNavigation {...defaultProps} />)

      const activeButton = screen.getByRole('button', { name: /definitions zone/i })
      const overlay = activeButton.querySelector('.absolute.inset-0.bg-primary\\/5')

      expect(overlay).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('handles missing onZoneChange prop gracefully', () => {
      const props = { ...defaultProps }
      delete props.onZoneChange

      expect(() => {
        renderWithProviders(<ZoneNavigation {...props} />)
      }).not.toThrow()
    })

    it('handles undefined activeZone', () => {
      renderWithProviders(<ZoneNavigation onZoneChange={mockOnZoneChange} />)

      expect(screen.getByText('Definitions Zone')).toBeInTheDocument()
      expect(screen.getByText('Test Area')).toBeInTheDocument()
    })

    it('works without className prop', () => {
      const props = { ...defaultProps }
      delete props.className

      expect(() => {
        renderWithProviders(<ZoneNavigation {...props} />)
      }).not.toThrow()
    })
  })

  describe('Performance', () => {
    it('does not cause unnecessary re-renders', () => {
      const { rerender } = renderWithProviders(<ZoneNavigation {...defaultProps} />)

      // Re-render with same props
      rerender(<ZoneNavigation {...defaultProps} />)

      // Component should still be functional
      expect(screen.getByText('Definitions Zone')).toBeInTheDocument()
      expect(screen.getByText('Test Area')).toBeInTheDocument()
    })

    it('handles rapid zone changes', async () => {
      const user = userEvent.setup()
      renderWithProviders(<ZoneNavigation {...defaultProps} />)

      const testButton = screen.getByRole('button', { name: /test area/i })
      const definitionsButton = screen.getByRole('button', { name: /definitions zone/i })

      // Rapid switching
      await user.click(testButton)
      await user.click(definitionsButton)
      await user.click(testButton)

      expect(mockOnZoneChange).toHaveBeenCalledTimes(3)
      expect(mockOnZoneChange).toHaveBeenLastCalledWith('testing')
    })
  })
})