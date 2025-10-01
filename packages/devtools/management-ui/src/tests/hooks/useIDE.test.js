/**
 * useIDE Hook Tests
 * Comprehensive tests for IDE selection, availability detection, and file opening
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useIDE } from '../../presentation/hooks/useIDE'
import { mockFetch, mockIDEsList, mockAPIResponses, securityTestPayloads } from '../mocks/ideApi'
import { mockLocalStorage } from '../utils/testHelpers'

describe('useIDE Hook', () => {
  let mockStorage

  beforeEach(() => {
    mockStorage = mockLocalStorage()
    Object.defineProperty(window, 'localStorage', { value: mockStorage })
    global.fetch = mockFetch()
  })

  describe('Initialization', () => {
    it('should initialize with loading state', () => {
      const { result } = renderHook(() => useIDE())

      expect(result.current.isLoading).toBe(true)
      expect(result.current.preferredIDE).toBe(null)
      expect(result.current.availableIDEs).toEqual([])
    })

    it('should load preferred IDE from localStorage', async () => {
      const savedIDE = { id: 'vscode', name: 'Visual Studio Code' }
      mockStorage.setItem('frigg_ide_preferences', JSON.stringify(savedIDE))

      const { result } = renderHook(() => useIDE())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.preferredIDE).toEqual(savedIDE)
    })

    it('should handle corrupted localStorage data gracefully', async () => {
      mockStorage.setItem('frigg_ide_preferences', 'invalid-json')

      const { result } = renderHook(() => useIDE())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.preferredIDE).toBe(null)
      expect(result.current.error).toBe(null) // Should not error
    })

    it('should fetch available IDEs on mount', async () => {
      const { result } = renderHook(() => useIDE())

      await waitFor(() => {
        expect(result.current.isDetecting).toBe(false)
      })

      expect(result.current.availableIDEs).toEqual(Object.values(mockIDEsList))
      expect(fetch).toHaveBeenCalledWith('/api/project/ides/available')
    })
  })

  describe('IDE Selection', () => {
    it('should set IDE preference and save to localStorage', async () => {
      const { result } = renderHook(() => useIDE())
      const testIDE = mockIDEsList.vscode

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.setIDE(testIDE)
      })

      expect(result.current.preferredIDE).toEqual(testIDE)
      expect(mockStorage.setItem).toHaveBeenCalledWith(
        'frigg_ide_preferences',
        JSON.stringify(testIDE)
      )
    })

    it('should handle custom IDE configuration', async () => {
      const { result } = renderHook(() => useIDE())
      const customIDE = {
        id: 'custom',
        name: 'Custom Command',
        command: 'code {path}'
      }

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.setIDE(customIDE)
      })

      expect(result.current.preferredIDE).toEqual(customIDE)
    })
  })

  describe('IDE Availability Detection', () => {
    it('should cache IDE availability results', async () => {
      const { result } = renderHook(() => useIDE())

      // Wait for initial fetch
      await waitFor(() => {
        expect(result.current.isDetecting).toBe(false)
      })

      // Clear fetch mock and fetch again
      fetch.mockClear()

      await act(async () => {
        await result.current.fetchAvailableIDEs()
      })

      // Should use cached results, no new fetch
      expect(fetch).not.toHaveBeenCalled()
    })

    it('should force refresh when requested', async () => {
      const { result } = renderHook(() => useIDE())

      await waitFor(() => {
        expect(result.current.isDetecting).toBe(false)
      })

      fetch.mockClear()

      await act(async () => {
        await result.current.fetchAvailableIDEs(true)
      })

      expect(fetch).toHaveBeenCalledWith('/api/project/ides/available')
    })

    it('should handle API errors gracefully with fallback IDEs', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const { result } = renderHook(() => useIDE())

      await waitFor(() => {
        expect(result.current.isDetecting).toBe(false)
      })

      expect(result.current.error).toBe('Network error')
      expect(result.current.availableIDEs).toHaveLength(16) // Fallback IDEs
      expect(result.current.availableIDEs.every(ide => !ide.available || ide.id === 'custom')).toBe(true)
    })

    it('should refresh IDE detection and clear cache', async () => {
      const { result } = renderHook(() => useIDE())

      await waitFor(() => {
        expect(result.current.isDetecting).toBe(false)
      })

      act(() => {
        result.current.refreshIDEDetection()
      })

      expect(mockStorage.removeItem).toHaveBeenCalledWith('frigg_ide_availability_cache')
    })
  })

  describe('File Opening', () => {
    it('should open file in preferred IDE successfully', async () => {
      const { result } = renderHook(() => useIDE())
      const testIDE = mockIDEsList.vscode

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.setIDE(testIDE)
      })

      await act(async () => {
        const response = await result.current.openInIDE('/test/path/file.js')
        expect(response.success).toBe(true)
      })

      expect(fetch).toHaveBeenCalledWith('/api/project/open-in-ide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: '/test/path/file.js',
          ide: 'vscode'
        })
      })
    })

    it('should open file with custom command', async () => {
      const { result } = renderHook(() => useIDE())
      const customIDE = {
        id: 'custom',
        name: 'Custom Command',
        command: 'subl {path}'
      }

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.setIDE(customIDE)
      })

      await act(async () => {
        await result.current.openInIDE('/test/path/file.js')
      })

      expect(fetch).toHaveBeenCalledWith('/api/project/open-in-ide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: '/test/path/file.js',
          command: 'subl {path}'
        })
      })
    })

    it('should throw error when no IDE is configured', async () => {
      const { result } = renderHook(() => useIDE())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await expect(async () => {
        await act(async () => {
          await result.current.openInIDE('/test/path/file.js')
        })
      }).rejects.toThrow('No IDE configured. Please select an IDE in settings.')
    })

    it('should throw error when no file path is provided', async () => {
      const { result } = renderHook(() => useIDE())

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await expect(async () => {
        await act(async () => {
          await result.current.openInIDE()
        })
      }).rejects.toThrow('File path is required')
    })

    it('should handle API errors when opening files', async () => {
      const { result } = renderHook(() => useIDE())

      // Mock API to return error
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'IDE not found' })
      })

      const testIDE = mockIDEsList.vscode

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.setIDE(testIDE)
      })

      await expect(async () => {
        await act(async () => {
          await result.current.openInIDE('/test/path/file.js')
        })
      }).rejects.toThrow('IDE not found')
    })
  })

  describe('Security Validation', () => {
    it('should reject dangerous file paths', async () => {
      const { result } = renderHook(() => useIDE())

      // Use mock that validates security
      global.fetch = mockFetch()

      const testIDE = mockIDEsList.vscode

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        result.current.setIDE(testIDE)
      })

      // Test various dangerous paths
      for (const dangerousPath of securityTestPayloads) {
        await expect(async () => {
          await act(async () => {
            await result.current.openInIDE(dangerousPath)
          })
        }).rejects.toThrow('Security validation failed')
      }
    })

    it('should validate custom commands for security', async () => {
      const { result } = renderHook(() => useIDE())
      const dangerousCommand = 'rm -rf / && code {path}'

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Hook should not prevent setting dangerous commands (validation is server-side)
      act(() => {
        result.current.setIDE({
          id: 'custom',
          name: 'Dangerous Command',
          command: dangerousCommand
        })
      })

      expect(result.current.preferredIDE.command).toBe(dangerousCommand)
    })
  })

  describe('IDE Categorization', () => {
    it('should group IDEs by category correctly', async () => {
      const { result } = renderHook(() => useIDE())

      await waitFor(() => {
        expect(result.current.isDetecting).toBe(false)
      })

      const categories = result.current.getIDEsByCategory()

      expect(categories.popular).toContain(mockIDEsList.vscode)
      expect(categories.jetbrains).toContain(mockIDEsList.webstorm)
      expect(categories.terminal).toContain(mockIDEsList.vim)
    })

    it('should sort IDEs by availability and name', async () => {
      const { result } = renderHook(() => useIDE())

      await waitFor(() => {
        expect(result.current.isDetecting).toBe(false)
      })

      const categories = result.current.getIDEsByCategory()

      // Available IDEs should come first
      categories.popular.forEach((ide, index) => {
        if (index > 0) {
          const prevIDE = categories.popular[index - 1]
          if (!ide.available && prevIDE.available) {
            // Available IDEs should come before unavailable ones
            expect(false).toBe(true)
          }
        }
      })
    })

    it('should filter available IDEs correctly', async () => {
      const { result } = renderHook(() => useIDE())

      await waitFor(() => {
        expect(result.current.isDetecting).toBe(false)
      })

      const availableIDEs = result.current.getAvailableIDEs()

      expect(availableIDEs.every(ide => ide.available || ide.id === 'custom')).toBe(true)
    })
  })

  describe('IDE Availability Checking', () => {
    it('should check specific IDE availability', async () => {
      const { result } = renderHook(() => useIDE())

      await waitFor(() => {
        expect(result.current.isDetecting).toBe(false)
      })

      await act(async () => {
        const availability = await result.current.checkIDEAvailability('vscode')
        expect(availability.data.available).toBe(true)
      })

      expect(fetch).toHaveBeenCalledWith('/api/project/ides/vscode/check')
    })

    it('should handle unavailable IDE check', async () => {
      const { result } = renderHook(() => useIDE())

      await waitFor(() => {
        expect(result.current.isDetecting).toBe(false)
      })

      await expect(async () => {
        await act(async () => {
          await result.current.checkIDEAvailability('intellij')
        })
      }).rejects.toThrow('Failed to check IDE availability')
    })
  })

  describe('Performance', () => {
    it('should cache API responses properly', async () => {
      const { result } = renderHook(() => useIDE())

      // Wait for initial load
      await waitFor(() => {
        expect(result.current.isDetecting).toBe(false)
      })

      // Check that cache is set
      expect(mockStorage.setItem).toHaveBeenCalledWith(
        'frigg_ide_availability_cache',
        expect.stringContaining('"data"')
      )
    })

    it('should respect cache duration', async () => {
      // Set expired cache
      const expiredCache = {
        data: Object.values(mockIDEsList),
        timestamp: Date.now() - (6 * 60 * 1000) // 6 minutes ago (cache is 5 minutes)
      }
      mockStorage.setItem('frigg_ide_availability_cache', JSON.stringify(expiredCache))

      const { result } = renderHook(() => useIDE())

      await waitFor(() => {
        expect(result.current.isDetecting).toBe(false)
      })

      // Should have made a fresh API call since cache expired
      expect(fetch).toHaveBeenCalledWith('/api/project/ides/available')
    })

    it('should not make unnecessary API calls', async () => {
      const { result, rerender } = renderHook(() => useIDE())

      await waitFor(() => {
        expect(result.current.isDetecting).toBe(false)
      })

      const initialCallCount = fetch.mock.calls.length

      // Re-render should not trigger new API calls
      rerender()

      await waitFor(() => {
        expect(result.current.isDetecting).toBe(false)
      })

      expect(fetch).toHaveBeenCalledTimes(initialCallCount)
    })
  })

  describe('Error Recovery', () => {
    it('should provide fallback IDEs when API fails', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const { result } = renderHook(() => useIDE())

      await waitFor(() => {
        expect(result.current.isDetecting).toBe(false)
      })

      expect(result.current.availableIDEs).toHaveLength(16) // Fallback list
      expect(result.current.availableIDEs.find(ide => ide.id === 'custom')).toBeDefined()
    })

    it('should clear errors on successful operations', async () => {
      // Start with failing API
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const { result } = renderHook(() => useIDE())

      await waitFor(() => {
        expect(result.current.error).toBe('Network error')
      })

      // Fix API
      global.fetch = mockFetch()

      await act(async () => {
        await result.current.refreshIDEDetection()
      })

      await waitFor(() => {
        expect(result.current.error).toBe(null)
      })
    })
  })
})