import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import Welcome from '../../components/Welcome'
import { FriggProvider } from '../../hooks/useFrigg'

// Mock the navigation
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate
  }
})

// Mock the socket hook
vi.mock('../../hooks/useSocket', () => ({
  useSocket: () => ({
    on: vi.fn(),
    emit: vi.fn()
  })
}))

// Mock API
const mockApi = {
  get: vi.fn(),
  post: vi.fn()
}
vi.mock('../../services/api', () => ({
  default: mockApi
}))

// Test wrapper component
const TestWrapper = ({ children, friggContextValue }) => {
  return (
    <BrowserRouter>
      <FriggProvider>
        {children}
      </FriggProvider>
    </BrowserRouter>
  )
}

describe('Welcome Component - Repository Selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    
    // Default API responses
    mockApi.get.mockImplementation((url) => {
      switch (url) {
        case '/api/project/repositories':
          return Promise.resolve({
            data: {
              data: {
                repositories: [],
                currentRepository: null,
                isMultiRepo: false
              }
            }
          })
        case '/api/repository/current':
          return Promise.resolve({
            data: { data: { repository: null } }
          })
        default:
          return Promise.resolve({ data: { data: {} } })
      }
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should show loading screen initially', async () => {
    render(
      <TestWrapper>
        <Welcome />
      </TestWrapper>
    )

    // Should show loading animation and messages
    expect(screen.getByText(/Scanning for local Frigg repositories/)).toBeInTheDocument()
  })

  it('should show repository selection even for single repository', async () => {
    // Mock single repository response
    mockApi.get.mockImplementation((url) => {
      switch (url) {
        case '/api/project/repositories':
          return Promise.resolve({
            data: {
              data: {
                repositories: [{
                  name: 'test-app',
                  path: '/path/to/test-app',
                  framework: 'React'
                }],
                currentRepository: null,
                isMultiRepo: false
              }
            }
          })
        case '/api/repository/current':
          return Promise.resolve({
            data: { data: { repository: null } }
          })
        default:
          return Promise.resolve({ data: { data: {} } })
      }
    })

    render(
      <TestWrapper>
        <Welcome />
      </TestWrapper>
    )

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.getByText('Welcome to Frigg')).toBeInTheDocument()
    }, { timeout: 5000 })

    // Should show repository selection interface, not auto-navigate
    expect(screen.getByText('Choose Your Project')).toBeInTheDocument()
    expect(screen.getByText('Select a Frigg Project')).toBeInTheDocument()
    
    // Should NOT navigate to dashboard automatically
    expect(mockNavigate).not.toHaveBeenCalledWith('/dashboard')
  })

  it('should show repository selection when multiple repositories are found', async () => {
    const mockRepositories = [
      {
        name: 'frigg-app-1',
        path: '/path/to/app1',
        framework: 'React',
        version: '1.0.0'
      },
      {
        name: 'frigg-app-2', 
        path: '/path/to/app2',
        framework: 'Vue',
        version: '2.0.0'
      },
      {
        name: 'frigg-app-3',
        path: '/path/to/app3',
        framework: 'Angular',
        version: '1.5.0'
      }
    ]

    // Mock multi-repository response
    mockApi.get.mockImplementation((url) => {
      switch (url) {
        case '/api/project/repositories':
          return Promise.resolve({
            data: {
              data: {
                repositories: mockRepositories,
                currentRepository: {
                  name: 'Multiple Repositories Available',
                  isMultiRepo: true,
                  availableRepos: mockRepositories
                },
                isMultiRepo: true
              }
            }
          })
        case '/api/repository/current':
          return Promise.resolve({
            data: { 
              data: { 
                repository: {
                  name: 'Multiple Repositories Available',
                  isMultiRepo: true,
                  availableRepos: mockRepositories
                }
              }
            }
          })
        default:
          return Promise.resolve({ data: { data: {} } })
      }
    })

    render(
      <TestWrapper>
        <Welcome />
      </TestWrapper>
    )

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.getByText('Welcome to Frigg Management UI')).toBeInTheDocument()
    }, { timeout: 3000 })

    // Should show repository selection interface
    expect(screen.getByText('Select Your Frigg Application')).toBeInTheDocument()
    
    // Should show all repositories
    expect(screen.getByText('frigg-app-1')).toBeInTheDocument()
    expect(screen.getByText('frigg-app-2')).toBeInTheDocument()
    expect(screen.getByText('frigg-app-3')).toBeInTheDocument()
    
    // Should show paths
    expect(screen.getByText('/path/to/app1')).toBeInTheDocument()
    expect(screen.getByText('/path/to/app2')).toBeInTheDocument() 
    expect(screen.getByText('/path/to/app3')).toBeInTheDocument()

    // Should NOT navigate to dashboard automatically
    expect(mockNavigate).not.toHaveBeenCalledWith('/dashboard')
  })

  it('should handle repository selection via dropdown and launch button', async () => {
    const mockRepositories = [
      {
        name: 'frigg-app-1',
        path: '/path/to/app1',
        framework: 'React'
      },
      {
        name: 'frigg-app-2',
        path: '/path/to/app2', 
        framework: 'Vue'
      }
    ]

    // Mock repository response
    mockApi.get.mockImplementation((url) => {
      switch (url) {
        case '/api/project/repositories':
          return Promise.resolve({
            data: {
              data: {
                repositories: mockRepositories,
                currentRepository: null,
                isMultiRepo: false
              }
            }
          })
        case '/api/repository/current':
          return Promise.resolve({
            data: { data: { repository: null } }
          })
        default:
          return Promise.resolve({ data: { data: {} } })
      }
    })

    // Mock successful repository switch
    mockApi.post.mockImplementation((url) => {
      if (url === '/api/project/switch-repository') {
        return Promise.resolve({
          data: {
            data: {
              repository: {
                name: 'frigg-app-1',
                path: '/path/to/app1'
              }
            }
          }
        })
      }
      return Promise.resolve({ data: { data: {} } })
    })

    render(
      <TestWrapper>
        <Welcome />
      </TestWrapper>
    )

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.getByText('Choose Your Project')).toBeInTheDocument()
    })

    // Click dropdown to open
    const dropdown = screen.getByText('Select a Frigg Project')
    fireEvent.click(dropdown)

    // Wait for dropdown options to appear
    await waitFor(() => {
      expect(screen.getByText('frigg-app-1')).toBeInTheDocument()
    })

    // Click on first repository in dropdown
    const repoOption = screen.getByText('frigg-app-1')
    fireEvent.click(repoOption)

    // Wait for selection to be made
    await waitFor(() => {
      expect(screen.getByText('Launch Project')).toBeInTheDocument()
    })

    // Click launch button
    const launchButton = screen.getByText('Launch Project')
    fireEvent.click(launchButton)

    // Should call switch repository API
    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/api/project/switch-repository', {
        repositoryPath: '/path/to/app1'
      })
    })

    // Should navigate to dashboard after selection
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    }, { timeout: 2000 })
  })

  it('should show create new app option when no repositories found', async () => {
    // Mock empty repository response
    mockApi.get.mockImplementation((url) => {
      switch (url) {
        case '/api/project/repositories':
          return Promise.resolve({
            data: {
              data: {
                repositories: [],
                currentRepository: null,
                isMultiRepo: false
              }
            }
          })
        case '/api/repository/current':
          return Promise.resolve({
            data: { data: { repository: null } }
          })
        default:
          return Promise.resolve({ data: { data: {} } })
      }
    })

    render(
      <TestWrapper>
        <Welcome />
      </TestWrapper>
    )

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.getByText('Welcome to Frigg')).toBeInTheDocument()
    })

    // Should show no repositories message
    expect(screen.getByText('No Frigg Projects Found')).toBeInTheDocument()
    
    // Should show create new button
    expect(screen.getByText('Create Your First Frigg Application')).toBeInTheDocument()
  })

  it('should show loading steps with proper timing', async () => {
    render(
      <TestWrapper>
        <Welcome />
      </TestWrapper>
    )

    // Should start with first loading message
    expect(screen.getByText('Scanning for local Frigg repositories...')).toBeInTheDocument()

    // Wait for additional messages to appear
    await waitFor(() => {
      expect(screen.getByText('Checking installed integrations...')).toBeInTheDocument()
    }, { timeout: 1000 })

    await waitFor(() => {
      expect(screen.getByText('Pinging npm for up-to-date API modules...')).toBeInTheDocument()
    }, { timeout: 2000 })
  })
})