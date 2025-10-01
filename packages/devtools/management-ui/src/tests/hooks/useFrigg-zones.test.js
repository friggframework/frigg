import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { FriggProvider, useFrigg } from '../../presentation/hooks/useFrigg'

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
global.localStorage = localStorageMock

// Mock socket hook
vi.mock('../../hooks/useSocket', () => ({
  useSocket: () => ({
    on: vi.fn(() => vi.fn()), // Return unsubscribe function
    emit: vi.fn(),
  })
}))

// Mock API service
vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  }
}))

const wrapper = ({ children }) => (
  <FriggProvider>{children}</FriggProvider>
)

describe('useFrigg - Zone Management', () => {
  beforeEach(() => {
    localStorageMock.getItem.mockClear()
    localStorageMock.setItem.mockClear()
    localStorageMock.removeItem.mockClear()
    localStorageMock.clear.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Zone State Management', () => {
    it('initializes with definitions zone as default', () => {
      const { result } = renderHook(() => useFrigg(), { wrapper })

      expect(result.current.activeZone).toBe('definitions')
    })

    it('loads saved zone preference from localStorage', () => {
      localStorageMock.getItem.mockReturnValue('testing')

      const { result } = renderHook(() => useFrigg(), { wrapper })

      expect(result.current.activeZone).toBe('testing')
      expect(localStorageMock.getItem).toHaveBeenCalledWith('frigg_active_zone')
    })

    it('ignores invalid zone values from localStorage', () => {
      localStorageMock.getItem.mockReturnValue('invalid-zone')

      const { result } = renderHook(() => useFrigg(), { wrapper })

      expect(result.current.activeZone).toBe('definitions')
    })

    it('switches zones using switchZone function', () => {
      const { result } = renderHook(() => useFrigg(), { wrapper })

      act(() => {
        result.current.switchZone('testing')
      })

      expect(result.current.activeZone).toBe('testing')
      expect(localStorageMock.setItem).toHaveBeenCalledWith('frigg_active_zone', 'testing')
    })

    it('switches back to definitions zone', () => {
      const { result } = renderHook(() => useFrigg(), { wrapper })

      act(() => {
        result.current.switchZone('testing')
      })

      act(() => {
        result.current.switchZone('definitions')
      })

      expect(result.current.activeZone).toBe('definitions')
      expect(localStorageMock.setItem).toHaveBeenLastCalledWith('frigg_active_zone', 'definitions')
    })

    it('handles rapid zone switching', () => {
      const { result } = renderHook(() => useFrigg(), { wrapper })

      // Rapidly switch zones
      act(() => {
        result.current.switchZone('testing')
        result.current.switchZone('definitions')
        result.current.switchZone('testing')
        result.current.switchZone('definitions')
      })

      expect(result.current.activeZone).toBe('definitions')
      expect(localStorageMock.setItem).toHaveBeenLastCalledWith('frigg_active_zone', 'definitions')
    })
  })

  describe('Integration Selection', () => {
    it('initializes with no selected integration', () => {
      const { result } = renderHook(() => useFrigg(), { wrapper })

      expect(result.current.selectedIntegration).toBeNull()
    })

    it('selects integration using selectIntegration function', () => {
      const { result } = renderHook(() => useFrigg(), { wrapper })

      const mockIntegration = {
        id: '1',
        name: 'Test Integration',
        description: 'Test description'
      }

      act(() => {
        result.current.selectIntegration(mockIntegration)
      })

      expect(result.current.selectedIntegration).toEqual(mockIntegration)
    })

    it('allows changing selected integration', () => {
      const { result } = renderHook(() => useFrigg(), { wrapper })

      const integration1 = { id: '1', name: 'Integration 1' }
      const integration2 = { id: '2', name: 'Integration 2' }

      act(() => {
        result.current.selectIntegration(integration1)
      })

      expect(result.current.selectedIntegration).toEqual(integration1)

      act(() => {
        result.current.selectIntegration(integration2)
      })

      expect(result.current.selectedIntegration).toEqual(integration2)
    })

    it('allows clearing selected integration by passing null', () => {
      const { result } = renderHook(() => useFrigg(), { wrapper })

      const mockIntegration = { id: '1', name: 'Test Integration' }

      act(() => {
        result.current.selectIntegration(mockIntegration)
      })

      expect(result.current.selectedIntegration).toEqual(mockIntegration)

      act(() => {
        result.current.selectIntegration(null)
      })

      expect(result.current.selectedIntegration).toBeNull()
    })

    it('preserves selected integration across zone switches', () => {
      const { result } = renderHook(() => useFrigg(), { wrapper })

      const mockIntegration = { id: '1', name: 'Test Integration' }

      act(() => {
        result.current.selectIntegration(mockIntegration)
        result.current.switchZone('testing')
      })

      expect(result.current.selectedIntegration).toEqual(mockIntegration)
      expect(result.current.activeZone).toBe('testing')

      act(() => {
        result.current.switchZone('definitions')
      })

      expect(result.current.selectedIntegration).toEqual(mockIntegration)
      expect(result.current.activeZone).toBe('definitions')
    })
  })

  describe('Test Environment Management', () => {
    it('initializes test environment with default state', () => {
      const { result } = renderHook(() => useFrigg(), { wrapper })

      expect(result.current.testEnvironment).toEqual({
        isRunning: false,
        testUrl: null,
        logs: [],
        status: 'stopped'
      })
    })

    it('updates test environment when started', async () => {
      // Mock successful API response
      const mockApi = await import('../../services/api')
      mockApi.default.post.mockResolvedValue({
        data: { testUrl: 'http://localhost:3000/test' }
      })

      const { result } = renderHook(() => useFrigg(), { wrapper })

      const mockIntegration = { id: '1', name: 'Test Integration' }

      act(() => {
        result.current.selectIntegration(mockIntegration)
      })

      await act(async () => {
        await result.current.startTestEnvironment()
      })

      expect(result.current.testEnvironment.isRunning).toBe(true)
      expect(result.current.testEnvironment.testUrl).toBe('http://localhost:3000/test')
      expect(result.current.testEnvironment.status).toBe('running')
    })

    it('handles test environment start failure', async () => {
      // Mock API failure
      const mockApi = await import('../../services/api')
      mockApi.default.post.mockRejectedValue(new Error('Start failed'))

      const { result } = renderHook(() => useFrigg(), { wrapper })

      const mockIntegration = { id: '1', name: 'Test Integration' }

      act(() => {
        result.current.selectIntegration(mockIntegration)
      })

      await act(async () => {
        try {
          await result.current.startTestEnvironment()
        } catch (error) {
          // Expected to throw
        }
      })

      expect(result.current.testEnvironment.isRunning).toBe(false)
      expect(result.current.testEnvironment.status).toBe('error')
    })

    it('stops test environment', async () => {
      // Mock successful API responses
      const mockApi = await import('../../services/api')
      mockApi.default.post.mockResolvedValue({
        data: { testUrl: 'http://localhost:3000/test' }
      })

      const { result } = renderHook(() => useFrigg(), { wrapper })

      const mockIntegration = { id: '1', name: 'Test Integration' }

      act(() => {
        result.current.selectIntegration(mockIntegration)
      })

      // Start test environment
      await act(async () => {
        await result.current.startTestEnvironment()
      })

      expect(result.current.testEnvironment.isRunning).toBe(true)

      // Stop test environment
      await act(async () => {
        await result.current.stopTestEnvironment()
      })

      expect(result.current.testEnvironment.isRunning).toBe(false)
      expect(result.current.testEnvironment.testUrl).toBeNull()
      expect(result.current.testEnvironment.status).toBe('stopped')
      expect(result.current.testEnvironment.logs).toEqual([])
    })

    it('restarts test environment', async () => {
      // Mock successful API responses
      const mockApi = await import('../../services/api')
      mockApi.default.post.mockResolvedValue({
        data: { testUrl: 'http://localhost:3000/test' }
      })

      const { result } = renderHook(() => useFrigg(), { wrapper })

      const mockIntegration = { id: '1', name: 'Test Integration' }

      act(() => {
        result.current.selectIntegration(mockIntegration)
      })

      // Start test environment
      await act(async () => {
        await result.current.startTestEnvironment()
      })

      // Restart test environment
      await act(async () => {
        await result.current.restartTestEnvironment()
      })

      expect(result.current.testEnvironment.isRunning).toBe(true)
      expect(result.current.testEnvironment.testUrl).toBe('http://localhost:3000/test')
      expect(result.current.testEnvironment.status).toBe('running')
    })

    it('handles start without selected integration', async () => {
      const { result } = renderHook(() => useFrigg(), { wrapper })

      // Try to start without selecting integration
      await act(async () => {
        const resultPromise = result.current.startTestEnvironment()
        expect(resultPromise).toBeUndefined()
      })

      expect(result.current.testEnvironment.isRunning).toBe(false)
    })

    it('can start test environment with specific integration parameter', async () => {
      // Mock successful API response
      const mockApi = await import('../../services/api')
      mockApi.default.post.mockResolvedValue({
        data: { testUrl: 'http://localhost:3000/test' }
      })

      const { result } = renderHook(() => useFrigg(), { wrapper })

      const mockIntegration = { id: '1', name: 'Test Integration' }

      await act(async () => {
        await result.current.startTestEnvironment(mockIntegration)
      })

      expect(result.current.testEnvironment.isRunning).toBe(true)
      expect(result.current.testEnvironment.testUrl).toBe('http://localhost:3000/test')
    })
  })

  describe('Log Management', () => {
    it('adds test logs', () => {
      const { result } = renderHook(() => useFrigg(), { wrapper })

      const logEntry = {
        level: 'info',
        message: 'Test log message',
        source: 'test'
      }

      act(() => {
        result.current.addTestLog(logEntry)
      })

      expect(result.current.testEnvironment.logs).toHaveLength(1)
      expect(result.current.testEnvironment.logs[0]).toMatchObject(logEntry)
      expect(result.current.testEnvironment.logs[0]).toHaveProperty('timestamp')
    })

    it('adds multiple test logs', () => {
      const { result } = renderHook(() => useFrigg(), { wrapper })

      const log1 = { level: 'info', message: 'First log', source: 'test' }
      const log2 = { level: 'error', message: 'Second log', source: 'test' }

      act(() => {
        result.current.addTestLog(log1)
        result.current.addTestLog(log2)
      })

      expect(result.current.testEnvironment.logs).toHaveLength(2)
      expect(result.current.testEnvironment.logs[0]).toMatchObject(log1)
      expect(result.current.testEnvironment.logs[1]).toMatchObject(log2)
    })

    it('clears test logs', () => {
      const { result } = renderHook(() => useFrigg(), { wrapper })

      // Add some logs first
      act(() => {
        result.current.addTestLog({ level: 'info', message: 'Test log 1' })
        result.current.addTestLog({ level: 'info', message: 'Test log 2' })
      })

      expect(result.current.testEnvironment.logs).toHaveLength(2)

      act(() => {
        result.current.clearTestLogs()
      })

      expect(result.current.testEnvironment.logs).toHaveLength(0)
    })

    it('preserves logs across zone switches', () => {
      const { result } = renderHook(() => useFrigg(), { wrapper })

      const logEntry = { level: 'info', message: 'Test log', source: 'test' }

      act(() => {
        result.current.addTestLog(logEntry)
        result.current.switchZone('testing')
      })

      expect(result.current.testEnvironment.logs).toHaveLength(1)

      act(() => {
        result.current.switchZone('definitions')
      })

      expect(result.current.testEnvironment.logs).toHaveLength(1)
    })
  })

  describe('Integration Workflow', () => {
    it('supports complete workflow from selection to testing', async () => {
      // Mock successful API response
      const mockApi = await import('../../services/api')
      mockApi.default.post.mockResolvedValue({
        data: { testUrl: 'http://localhost:3000/test' }
      })

      const { result } = renderHook(() => useFrigg(), { wrapper })

      const mockIntegration = {
        id: '1',
        name: 'Complete Workflow Integration',
        description: 'Test integration for complete workflow'
      }

      // Step 1: Select integration (typically in definitions zone)
      act(() => {
        result.current.selectIntegration(mockIntegration)
      })

      expect(result.current.selectedIntegration).toEqual(mockIntegration)

      // Step 2: Switch to testing zone
      act(() => {
        result.current.switchZone('testing')
      })

      expect(result.current.activeZone).toBe('testing')

      // Step 3: Start test environment
      await act(async () => {
        await result.current.startTestEnvironment()
      })

      expect(result.current.testEnvironment.isRunning).toBe(true)
      expect(result.current.testEnvironment.testUrl).toBe('http://localhost:3000/test')

      // Step 4: Add some test logs
      act(() => {
        result.current.addTestLog({
          level: 'info',
          message: 'Test started successfully',
          source: 'integration'
        })
      })

      expect(result.current.testEnvironment.logs).toHaveLength(1)

      // Step 5: Stop test environment
      await act(async () => {
        await result.current.stopTestEnvironment()
      })

      expect(result.current.testEnvironment.isRunning).toBe(false)
      expect(result.current.testEnvironment.logs).toEqual([])
    })

    it('maintains state consistency during complex interactions', async () => {
      const { result } = renderHook(() => useFrigg(), { wrapper })

      const integration1 = { id: '1', name: 'Integration 1' }
      const integration2 = { id: '2', name: 'Integration 2' }

      // Complex interaction sequence
      act(() => {
        result.current.selectIntegration(integration1)
        result.current.switchZone('testing')
      })

      act(() => {
        result.current.switchZone('definitions')
        result.current.selectIntegration(integration2)
      })

      act(() => {
        result.current.switchZone('testing')
      })

      expect(result.current.activeZone).toBe('testing')
      expect(result.current.selectedIntegration).toEqual(integration2)
      expect(result.current.testEnvironment.isRunning).toBe(false)
    })
  })

  describe('Error Handling', () => {
    it('handles localStorage errors gracefully', () => {
      localStorageMock.getItem.mockImplementation(() => {
        throw new Error('localStorage error')
      })

      expect(() => {
        renderHook(() => useFrigg(), { wrapper })
      }).not.toThrow()
    })

    it('handles localStorage setItem errors gracefully', () => {
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error('localStorage setItem error')
      })

      const { result } = renderHook(() => useFrigg(), { wrapper })

      expect(() => {
        act(() => {
          result.current.switchZone('testing')
        })
      }).not.toThrow()
    })

    it('maintains functionality when localStorage is unavailable', () => {
      // Simulate localStorage being unavailable
      global.localStorage = undefined

      const { result } = renderHook(() => useFrigg(), { wrapper })

      expect(() => {
        act(() => {
          result.current.switchZone('testing')
          result.current.selectIntegration({ id: '1', name: 'Test' })
        })
      }).not.toThrow()

      expect(result.current.activeZone).toBe('testing')
      expect(result.current.selectedIntegration).toMatchObject({ id: '1', name: 'Test' })

      // Restore localStorage
      global.localStorage = localStorageMock
    })
  })

  describe('Performance', () => {
    it('handles rapid state changes efficiently', () => {
      const { result } = renderHook(() => useFrigg(), { wrapper })

      const start = performance.now()

      // Perform many rapid state changes
      act(() => {
        for (let i = 0; i < 100; i++) {
          result.current.switchZone(i % 2 === 0 ? 'testing' : 'definitions')
          result.current.selectIntegration({ id: i.toString(), name: `Integration ${i}` })
        }
      })

      const end = performance.now()

      // Should complete within reasonable time
      expect(end - start).toBeLessThan(100)

      // Final state should be consistent
      expect(result.current.activeZone).toBe('definitions')
      expect(result.current.selectedIntegration.name).toBe('Integration 99')
    })

    it('does not cause memory leaks with repeated operations', () => {
      const { result, unmount } = renderHook(() => useFrigg(), { wrapper })

      // Simulate many operations that could cause memory leaks
      act(() => {
        for (let i = 0; i < 1000; i++) {
          result.current.addTestLog({
            level: 'info',
            message: `Log ${i}`,
            source: 'performance-test'
          })
        }

        result.current.clearTestLogs()
      })

      // Should be able to unmount without issues
      expect(() => unmount()).not.toThrow()
    })
  })
})