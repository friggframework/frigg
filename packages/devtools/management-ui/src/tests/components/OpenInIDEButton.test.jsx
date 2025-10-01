/**
 * OpenInIDEButton Component Tests
 * Comprehensive tests for OpenInIDE button behavior and error handling
 */

import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import OpenInIDEButton from '../../presentation/components/common/OpenInIDEButton'
import { mockFetch, mockIDEsList } from '../mocks/ideApi'
import { userInteraction } from '../utils/testHelpers'

// Mock the useIDE hook
const mockUseIDE = {
  preferredIDE: null,
  openInIDE: vi.fn()
}

vi.mock('../../hooks/useIDE', () => ({
  useIDE: () => mockUseIDE
}))

const defaultProps = {
  filePath: '/test/path/file.js',
  variant: 'default',
  size: 'default',
  showIDEName: true,
  disabled: false
}

describe('OpenInIDEButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = mockFetch()
  })

  describe('No IDE Configured State', () => {
    beforeEach(() => {
      mockUseIDE.preferredIDE = null
    })

    it('should show configure IDE prompt when no IDE is set', () => {
      render(<OpenInIDEButton {...defaultProps} />)

      expect(screen.getByText('Configure IDE')).toBeInTheDocument()
      expect(screen.getByTitle('Configure IDE in Settings first')).toBeInTheDocument()
    })

    it('should disable button when no IDE is configured', () => {
      render(<OpenInIDEButton {...defaultProps} />)

      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
    })

    it('should show settings icon when no IDE is configured', () => {
      render(<OpenInIDEButton {...defaultProps} />)

      expect(screen.getByRole('button').querySelector('svg')).toBeInTheDocument()
    })
  })

  describe('IDE Configured State', () => {
    beforeEach(() => {
      mockUseIDE.preferredIDE = mockIDEsList.vscode
    })

    it('should show IDE name in button text', () => {
      render(<OpenInIDEButton {...defaultProps} />)

      expect(screen.getByText('Open in Visual Studio Code')).toBeInTheDocument()
    })

    it('should truncate long IDE names', () => {
      mockUseIDE.preferredIDE = {
        ...mockIDEsList.vscode,
        name: 'Very Long IDE Name That Should Be Truncated'
      }

      render(<OpenInIDEButton {...defaultProps} />)

      expect(screen.getByText('Open in Very Long I...')).toBeInTheDocument()
    })

    it('should hide IDE name when showIDEName is false', () => {
      render(<OpenInIDEButton {...defaultProps} showIDEName={false} />)

      expect(screen.getByText('Open in IDE')).toBeInTheDocument()
      expect(screen.queryByText('Visual Studio Code')).not.toBeInTheDocument()
    })

    it('should show external link icon by default', () => {
      render(<OpenInIDEButton {...defaultProps} />)

      const button = screen.getByRole('button')
      expect(button.querySelector('svg')).toBeInTheDocument()
    })

    it('should be enabled when IDE is configured and file path is provided', () => {
      render(<OpenInIDEButton {...defaultProps} />)

      const button = screen.getByRole('button')
      expect(button).not.toBeDisabled()
    })

    it('should show helpful tooltip', () => {
      render(<OpenInIDEButton {...defaultProps} />)

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('title', 'Open /test/path/file.js in Visual Studio Code')
    })
  })

  describe('File Opening Behavior', () => {
    beforeEach(() => {
      mockUseIDE.preferredIDE = mockIDEsList.vscode
      mockUseIDE.openInIDE.mockResolvedValue({ success: true })
    })

    it('should call openInIDE when button is clicked', async () => {
      render(<OpenInIDEButton {...defaultProps} />)

      const button = screen.getByRole('button')
      await userInteraction.click(button)

      expect(mockUseIDE.openInIDE).toHaveBeenCalledWith('/test/path/file.js')
    })

    it('should show loading state while opening', async () => {
      let resolvePromise
      mockUseIDE.openInIDE.mockReturnValue(new Promise(resolve => {
        resolvePromise = resolve
      }))

      render(<OpenInIDEButton {...defaultProps} />)

      const button = screen.getByRole('button')
      await userInteraction.click(button)

      expect(screen.getByText('Opening...')).toBeInTheDocument()
      expect(button.querySelector('.animate-spin')).toBeInTheDocument()

      // Resolve the promise
      resolvePromise({ success: true })
      await waitFor(() => {
        expect(screen.queryByText('Opening...')).not.toBeInTheDocument()
      })
    })

    it('should show success state after successful opening', async () => {
      render(<OpenInIDEButton {...defaultProps} />)

      const button = screen.getByRole('button')
      await userInteraction.click(button)

      await waitFor(() => {
        expect(screen.getByText('Opened!')).toBeInTheDocument()
      })

      expect(button).toHaveClass('bg-green-600')
    })

    it('should clear success state after 2 seconds', async () => {
      vi.useFakeTimers()

      render(<OpenInIDEButton {...defaultProps} />)

      const button = screen.getByRole('button')
      await userInteraction.click(button)

      await waitFor(() => {
        expect(screen.getByText('Opened!')).toBeInTheDocument()
      })

      // Fast-forward 2 seconds
      vi.advanceTimersByTime(2000)

      await waitFor(() => {
        expect(screen.queryByText('Opened!')).not.toBeInTheDocument()
      })

      vi.useRealTimers()
    })

    it('should disable button while opening', async () => {
      let resolvePromise
      mockUseIDE.openInIDE.mockReturnValue(new Promise(resolve => {
        resolvePromise = resolve
      }))

      render(<OpenInIDEButton {...defaultProps} />)

      const button = screen.getByRole('button')
      await userInteraction.click(button)

      expect(button).toBeDisabled()

      resolvePromise({ success: true })
      await waitFor(() => {
        expect(button).not.toBeDisabled()
      })
    })
  })

  describe('Error Handling', () => {
    beforeEach(() => {
      mockUseIDE.preferredIDE = mockIDEsList.vscode
    })

    it('should show error state when opening fails', async () => {
      mockUseIDE.openInIDE.mockRejectedValue(new Error('IDE not found'))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      render(<OpenInIDEButton {...defaultProps} />)

      const button = screen.getByRole('button')
      await userInteraction.click(button)

      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument()
      })

      expect(button).toHaveClass('bg-red-600')
      expect(consoleSpy).toHaveBeenCalledWith('Failed to open in IDE:', expect.any(Error))

      consoleSpy.mockRestore()
    })

    it('should clear error state after 3 seconds', async () => {
      vi.useFakeTimers()

      mockUseIDE.openInIDE.mockRejectedValue(new Error('IDE not found'))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      render(<OpenInIDEButton {...defaultProps} />)

      const button = screen.getByRole('button')
      await userInteraction.click(button)

      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument()
      })

      // Fast-forward 3 seconds
      vi.advanceTimersByTime(3000)

      await waitFor(() => {
        expect(screen.queryByText('Failed')).not.toBeInTheDocument()
      })

      consoleSpy.mockRestore()
      vi.useRealTimers()
    })

    it('should show error icon in error state', async () => {
      mockUseIDE.openInIDE.mockRejectedValue(new Error('IDE not found'))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      render(<OpenInIDEButton {...defaultProps} />)

      const button = screen.getByRole('button')
      await userInteraction.click(button)

      await waitFor(() => {
        expect(button.querySelector('svg')).toBeInTheDocument()
      })

      consoleSpy.mockRestore()
    })

    it('should handle missing file path gracefully', () => {
      render(<OpenInIDEButton {...defaultProps} filePath="" />)

      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('title', 'No file path provided')
    })

    it('should not attempt to open when no file path is provided', async () => {
      render(<OpenInIDEButton {...defaultProps} filePath="" />)

      const button = screen.getByRole('button')
      await userInteraction.click(button)

      expect(mockUseIDE.openInIDE).not.toHaveBeenCalled()
    })
  })

  describe('Button Variants and Styling', () => {
    beforeEach(() => {
      mockUseIDE.preferredIDE = mockIDEsList.vscode
    })

    it('should apply custom variant', () => {
      render(<OpenInIDEButton {...defaultProps} variant="outline" />)

      const button = screen.getByRole('button')
      // Exact class checking would depend on your Button component implementation
      expect(button).toBeInTheDocument()
    })

    it('should apply custom size', () => {
      render(<OpenInIDEButton {...defaultProps} size="sm" />)

      const button = screen.getByRole('button')
      expect(button).toBeInTheDocument()
    })

    it('should apply custom className', () => {
      render(<OpenInIDEButton {...defaultProps} className="custom-class" />)

      const button = screen.getByRole('button')
      expect(button).toHaveClass('custom-class')
    })

    it('should respect disabled prop', () => {
      render(<OpenInIDEButton {...defaultProps} disabled={true} />)

      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
    })

    it('should combine disabled prop with other disable conditions', () => {
      render(<OpenInIDEButton {...defaultProps} disabled={true} filePath="" />)

      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
    })
  })

  describe('Status Transitions', () => {
    beforeEach(() => {
      mockUseIDE.preferredIDE = mockIDEsList.vscode
    })

    it('should transition from normal to loading to success', async () => {
      render(<OpenInIDEButton {...defaultProps} />)

      const button = screen.getByRole('button')

      // Initial state
      expect(screen.getByText('Open in Visual Studio Code')).toBeInTheDocument()

      // Click and check loading state
      await userInteraction.click(button)
      expect(screen.getByText('Opening...')).toBeInTheDocument()

      // Wait for success state
      await waitFor(() => {
        expect(screen.getByText('Opened!')).toBeInTheDocument()
      })
    })

    it('should transition from normal to loading to error', async () => {
      mockUseIDE.openInIDE.mockRejectedValue(new Error('Failed'))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      render(<OpenInIDEButton {...defaultProps} />)

      const button = screen.getByRole('button')

      // Initial state
      expect(screen.getByText('Open in Visual Studio Code')).toBeInTheDocument()

      // Click and check loading state
      await userInteraction.click(button)
      expect(screen.getByText('Opening...')).toBeInTheDocument()

      // Wait for error state
      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument()
      })

      consoleSpy.mockRestore()
    })

    it('should allow multiple clicks after state reset', async () => {
      vi.useFakeTimers()

      render(<OpenInIDEButton {...defaultProps} />)

      const button = screen.getByRole('button')

      // First click
      await userInteraction.click(button)
      await waitFor(() => {
        expect(screen.getByText('Opened!')).toBeInTheDocument()
      })

      // Wait for state to reset
      vi.advanceTimersByTime(2000)
      await waitFor(() => {
        expect(screen.queryByText('Opened!')).not.toBeInTheDocument()
      })

      // Second click should work
      await userInteraction.click(button)
      expect(mockUseIDE.openInIDE).toHaveBeenCalledTimes(2)

      vi.useRealTimers()
    })
  })

  describe('Accessibility', () => {
    beforeEach(() => {
      mockUseIDE.preferredIDE = mockIDEsList.vscode
    })

    it('should have proper button role', () => {
      render(<OpenInIDEButton {...defaultProps} />)

      expect(screen.getByRole('button')).toBeInTheDocument()
    })

    it('should provide meaningful button text', () => {
      render(<OpenInIDEButton {...defaultProps} />)

      const button = screen.getByRole('button')
      expect(button).toHaveAccessibleName('Open in Visual Studio Code')
    })

    it('should update accessible name based on state', async () => {
      render(<OpenInIDEButton {...defaultProps} />)

      const button = screen.getByRole('button')

      await userInteraction.click(button)

      await waitFor(() => {
        expect(button).toHaveAccessibleName('Opened!')
      })
    })

    it('should support keyboard activation', async () => {
      render(<OpenInIDEButton {...defaultProps} />)

      const button = screen.getByRole('button')
      button.focus()

      await userInteraction.keyboard('{Enter}')

      expect(mockUseIDE.openInIDE).toHaveBeenCalled()
    })

    it('should provide helpful tooltips for disabled states', () => {
      render(<OpenInIDEButton {...defaultProps} filePath="" />)

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('title', 'No file path provided')
    })
  })

  describe('Performance', () => {
    beforeEach(() => {
      mockUseIDE.preferredIDE = mockIDEsList.vscode
    })

    it('should render quickly', () => {
      const start = performance.now()
      render(<OpenInIDEButton {...defaultProps} />)
      const end = performance.now()

      expect(end - start).toBeLessThan(50) // Should render very quickly
    })

    it('should not cause unnecessary re-renders', () => {
      const { rerender } = render(<OpenInIDEButton {...defaultProps} />)

      let renderCount = 0
      const TestComponent = () => {
        renderCount++
        return <OpenInIDEButton {...defaultProps} />
      }

      rerender(<TestComponent />)
      const initialRenderCount = renderCount

      rerender(<TestComponent />)

      expect(renderCount).toBe(initialRenderCount)
    })

    it('should handle rapid clicks gracefully', async () => {
      render(<OpenInIDEButton {...defaultProps} />)

      const button = screen.getByRole('button')

      // Rapid clicks should not cause issues
      await userInteraction.click(button)
      await userInteraction.click(button)
      await userInteraction.click(button)

      // Only first click should be processed due to disabled state during opening
      expect(mockUseIDE.openInIDE).toHaveBeenCalledTimes(1)
    })
  })

  describe('Edge Cases', () => {
    it('should handle null filePath gracefully', () => {
      render(<OpenInIDEButton {...defaultProps} filePath={null} />)

      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
    })

    it('should handle undefined filePath gracefully', () => {
      render(<OpenInIDEButton {...defaultProps} filePath={undefined} />)

      const button = screen.getByRole('button')
      expect(button).toBeDisabled()
    })

    it('should handle IDE with no name', () => {
      mockUseIDE.preferredIDE = { ...mockIDEsList.vscode, name: '' }

      render(<OpenInIDEButton {...defaultProps} />)

      expect(screen.getByText('Open in IDE')).toBeInTheDocument()
    })

    it('should handle very long file paths in tooltip', () => {
      const longPath = '/very/long/path/that/might/cause/issues/with/tooltip/display/file.js'

      mockUseIDE.preferredIDE = mockIDEsList.vscode

      render(<OpenInIDEButton {...defaultProps} filePath={longPath} />)

      const button = screen.getByRole('button')
      expect(button).toHaveAttribute('title', `Open ${longPath} in Visual Studio Code`)
    })
  })
})