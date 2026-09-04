import React from 'react'
import { render } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { ThemeProvider } from '../../components/theme-provider'

// Mock providers for testing
const MockSocketProvider = ({ children }) => children
const MockFriggProvider = ({ children, initialUser, initialRepositories, initialCurrentRepository }) => {
  // Create a minimal mock context
  const mockContext = {
    user: initialUser,
    repositories: initialRepositories || [],
    currentRepository: initialCurrentRepository,
    isLoading: false,
    loading: false,
    error: null,
    status: 'running',
    integrations: [],
    envVariables: {},
    users: [],
    connections: [],
    currentUser: initialUser,
    switchRepository: vi.fn().mockResolvedValue(),
    fetchRepositories: vi.fn().mockResolvedValue([]),
    startFrigg: vi.fn().mockResolvedValue(),
    stopFrigg: vi.fn().mockResolvedValue(),
    restartFrigg: vi.fn().mockResolvedValue(),
    installIntegration: vi.fn().mockResolvedValue(),
    createUser: vi.fn().mockResolvedValue(),
    refreshData: vi.fn().mockResolvedValue(),
  }
  
  return (
    <div data-testid="mock-frigg-provider" data-context={JSON.stringify(mockContext)}>
      {children}
    </div>
  )
}

// Custom render function that includes all providers
export function renderWithProviders(ui, options = {}) {
  const {
    initialEntries = ['/'],
    user = null,
    repositories = [],
    currentRepository = null,
    ...renderOptions
  } = options

  function Wrapper({ children }) {
    return (
      <BrowserRouter>
        <ThemeProvider defaultTheme="light">
          <MockSocketProvider>
            <MockFriggProvider 
              initialUser={user}
              initialRepositories={repositories}
              initialCurrentRepository={currentRepository}
            >
              {children}
            </MockFriggProvider>
          </MockSocketProvider>
        </ThemeProvider>
      </BrowserRouter>
    )
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions })
}

// Mock data factories
export const createMockRepository = (overrides = {}) => ({
  name: 'test-repo',
  path: '/test/path',
  framework: 'React',
  hasBackend: true,
  version: '1.0.0',
  detectionReasons: ['frigg dependencies'],
  ...overrides
})

export const createMockUser = (overrides = {}) => ({
  id: '1',
  email: 'test@example.com',
  name: 'Test User',
  createdAt: '2023-01-01T00:00:00Z',
  ...overrides
})

export const createMockIntegration = (overrides = {}) => ({
  name: 'test-integration',
  version: '1.0.0',
  installed: true,
  configured: true,
  status: 'active',
  ...overrides
})

export const createMockConnection = (overrides = {}) => ({
  id: '1',
  type: 'slack',
  name: 'Test Connection',
  status: 'active',
  lastUsed: '2023-01-01T00:00:00Z',
  config: {},
  ...overrides
})

// Common test scenarios
export const mockApiSuccess = (endpoint, data) => {
  return {
    endpoint,
    response: {
      data: { data }
    }
  }
}

export const mockApiError = (endpoint, error = 'Test error') => {
  return {
    endpoint,
    error: new Error(error)
  }
}

// Async utilities
export const waitForLoading = () => new Promise(resolve => setTimeout(resolve, 0))

export const waitForAnimation = () => new Promise(resolve => setTimeout(resolve, 100))

// Re-export everything from testing library
export * from '@testing-library/react'
export { default as userEvent } from '@testing-library/user-event'