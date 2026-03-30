/**
 * Tests for ChatSessionsSidebar component
 *
 * Tests session management, WebSocket-based persistence,
 * git branch warnings, and auto-session creation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

// Mock assistant-ui hooks
const mockSwitchToNewThread = vi.fn()
const mockExport = vi.fn()
const mockImport = vi.fn()
const mockSubscribe = vi.fn()
const mockGetState = vi.fn()

vi.mock('@assistant-ui/react', () => ({
  useAssistantRuntime: () => ({
    switchToNewThread: mockSwitchToNewThread,
  }),
  useThreadRuntime: () => ({
    export: mockExport,
    import: mockImport,
    subscribe: mockSubscribe,
    getState: mockGetState,
  }),
}))

// Mock useFrigg hook
const mockCurrentRepository = {
  path: '/test/repo',
  name: 'test-repo',
  git: {
    currentBranch: 'main',
  },
}

vi.mock('../../presentation/hooks/useFrigg', () => ({
  useFrigg: () => ({
    currentRepository: mockCurrentRepository,
  }),
}))

// Mock useChatSessions hook
const mockSessions = []
const mockCurrentSession = null
const mockLoading = false
const mockError = null
const mockSaveSession = vi.fn()
const mockDeleteSession = vi.fn()
const mockCreateSession = vi.fn()
const mockSwitchSession = vi.fn()
const mockLoadSession = vi.fn()

let mockHookState = {
  sessions: mockSessions,
  currentSession: mockCurrentSession,
  loading: mockLoading,
  error: mockError,
}

vi.mock('../../presentation/hooks/useChatSessions', () => ({
  useChatSessions: () => ({
    sessions: mockHookState.sessions,
    currentSession: mockHookState.currentSession,
    loading: mockHookState.loading,
    error: mockHookState.error,
    saveSession: mockSaveSession,
    deleteSession: mockDeleteSession,
    createSession: mockCreateSession,
    switchSession: mockSwitchSession,
    loadSession: mockLoadSession,
  }),
}))

// Import component after mocks
import { ChatSessionsSidebar } from '../../presentation/components/chat/ChatSessionsSidebar'

// Helper to wrap component with providers
const renderWithProviders = (ui, options = {}) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>, options)
}

describe('ChatSessionsSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetState.mockReturnValue({ messages: [] })
    mockSubscribe.mockReturnValue(() => {})
    mockExport.mockReturnValue({ messages: [] })

    // Reset mock hook state
    mockHookState = {
      sessions: [],
      currentSession: null,
      loading: false,
      error: null,
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('renders empty state when no sessions exist', () => {
      renderWithProviders(<ChatSessionsSidebar />)

      expect(screen.getByText('No chat sessions yet')).toBeInTheDocument()
      expect(screen.getByText('Start a conversation to create your first session')).toBeInTheDocument()
    })

    it('renders Chat Sessions header', () => {
      renderWithProviders(<ChatSessionsSidebar />)

      expect(screen.getByText('Chat Sessions')).toBeInTheDocument()
    })

    it('renders IDE hint banner', () => {
      renderWithProviders(<ChatSessionsSidebar />)

      expect(screen.getByText('Need detailed AI assistance?')).toBeInTheDocument()
      expect(screen.getByText(/For complex tasks with file editing/)).toBeInTheDocument()
    })

    it('renders new chat button', () => {
      renderWithProviders(<ChatSessionsSidebar />)

      const newChatButton = screen.getByTitle('New chat')
      expect(newChatButton).toBeInTheDocument()
    })

    it('renders collapse button', () => {
      renderWithProviders(<ChatSessionsSidebar />)

      const collapseButton = screen.getByTitle('Collapse sidebar')
      expect(collapseButton).toBeInTheDocument()
    })

    it('renders loading state', () => {
      mockHookState.loading = true
      mockHookState.sessions = []

      renderWithProviders(<ChatSessionsSidebar />)

      expect(screen.getByText('Loading sessions...')).toBeInTheDocument()
    })

    it('renders error state', () => {
      mockHookState.error = 'Failed to load sessions'

      renderWithProviders(<ChatSessionsSidebar />)

      expect(screen.getByText('Failed to load sessions')).toBeInTheDocument()
    })
  })

  describe('Session Creation', () => {
    it('creates new session when New chat button is clicked', async () => {
      renderWithProviders(<ChatSessionsSidebar />)

      const newChatButton = screen.getByTitle('New chat')
      fireEvent.click(newChatButton)

      await waitFor(() => {
        expect(mockCreateSession).toHaveBeenCalled()
      })

      // Check that switchToNewThread was called
      expect(mockSwitchToNewThread).toHaveBeenCalled()
    })
  })

  describe('Session Display', () => {
    it('displays sessions from hook', () => {
      mockHookState.sessions = [
        {
          id: 'session-1',
          preview: 'Test Session',
          metadata: { branch: 'main' },
          createdAt: Date.now() - 1000,
          updatedAt: Date.now(),
        },
      ]

      renderWithProviders(<ChatSessionsSidebar />)

      expect(screen.getByText('Test Session')).toBeInTheDocument()
    })

    it('displays multiple sessions', () => {
      mockHookState.sessions = [
        {
          id: 'session-1',
          preview: 'First Session',
          metadata: { branch: 'main' },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'session-2',
          preview: 'Second Session',
          metadata: { branch: 'develop' },
          createdAt: Date.now() - 1000,
          updatedAt: Date.now() - 1000,
        },
      ]

      renderWithProviders(<ChatSessionsSidebar />)

      expect(screen.getByText('First Session')).toBeInTheDocument()
      expect(screen.getByText('Second Session')).toBeInTheDocument()
    })
  })

  describe('Session Selection', () => {
    it('highlights active session', () => {
      mockHookState.sessions = [
        {
          id: 'session-1',
          preview: 'Active Session',
          metadata: { branch: 'main' },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]
      mockHookState.currentSession = mockHookState.sessions[0]

      renderWithProviders(<ChatSessionsSidebar />)

      // Find the session item container by looking for the group class
      const sessionText = screen.getByText('Active Session')
      const sessionItem = sessionText.closest('.group')
      expect(sessionItem).toHaveClass('bg-purple-500/10')
    })

    it('calls switchSession when session is clicked', async () => {
      mockHookState.sessions = [
        {
          id: 'session-1',
          preview: 'Clickable Session',
          metadata: { branch: 'main' },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]
      mockLoadSession.mockResolvedValue({
        id: 'session-1',
        messages: [],
        metadata: { branch: 'main' },
      })

      renderWithProviders(<ChatSessionsSidebar />)

      const sessionText = screen.getByText('Clickable Session')
      const sessionItem = sessionText.closest('.group')
      fireEvent.click(sessionItem)

      await waitFor(() => {
        expect(mockLoadSession).toHaveBeenCalledWith('session-1')
      })
    })
  })

  describe('Session Deletion', () => {
    it('removes session when delete is clicked', async () => {
      mockHookState.sessions = [
        {
          id: 'session-1',
          preview: 'Session to Delete',
          metadata: { branch: 'main' },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]

      renderWithProviders(<ChatSessionsSidebar />)

      // Find and click the menu button (three dots)
      const sessionItem = screen.getByText('Session to Delete').closest('.group')
      const menuButton = sessionItem.querySelector('button')
      fireEvent.click(menuButton)

      // Click delete
      const deleteButton = await screen.findByText('Delete')
      fireEvent.click(deleteButton)

      await waitFor(() => {
        expect(mockDeleteSession).toHaveBeenCalledWith('session-1')
      })
    })
  })

  describe('Git Branch Warning', () => {
    it('shows warning icon when session branch differs from current', () => {
      mockHookState.sessions = [
        {
          id: 'session-1',
          preview: 'Old Branch Session',
          metadata: { branch: 'feature-old' }, // Different from current 'main'
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]

      renderWithProviders(<ChatSessionsSidebar />)

      // Look for AlertTriangle icon (warning indicator)
      const warningIcon = document.querySelector('[class*="text-yellow-500"]')
      expect(warningIcon).toBeInTheDocument()
    })

    it('does not show warning when branch matches', () => {
      mockHookState.sessions = [
        {
          id: 'session-1',
          preview: 'Same Branch Session',
          metadata: { branch: 'main' }, // Same as current
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]

      renderWithProviders(<ChatSessionsSidebar />)

      // Should not have warning icon in session item
      const sessionText = screen.getByText('Same Branch Session')
      const sessionItem = sessionText.closest('.group')
      const warningIcon = sessionItem?.querySelector('[class*="text-yellow-500"]')
      expect(warningIcon).not.toBeInTheDocument()
    })
  })

  describe('Collapsed State', () => {
    it('renders collapsed view when collapsed prop is true', () => {
      renderWithProviders(<ChatSessionsSidebar collapsed={true} />)

      // Should have expand button instead of collapse
      expect(screen.getByTitle('Expand sidebar')).toBeInTheDocument()
      expect(screen.queryByText('Chat Sessions')).not.toBeInTheDocument()
    })

    it('calls onCollapsedChange when collapse button clicked', () => {
      const onCollapsedChange = vi.fn()
      renderWithProviders(
        <ChatSessionsSidebar collapsed={false} onCollapsedChange={onCollapsedChange} />
      )

      const collapseButton = screen.getByTitle('Collapse sidebar')
      fireEvent.click(collapseButton)

      expect(onCollapsedChange).toHaveBeenCalledWith(true)
    })

    it('calls onCollapsedChange when expand button clicked in collapsed state', () => {
      const onCollapsedChange = vi.fn()
      renderWithProviders(
        <ChatSessionsSidebar collapsed={true} onCollapsedChange={onCollapsedChange} />
      )

      const expandButton = screen.getByTitle('Expand sidebar')
      fireEvent.click(expandButton)

      expect(onCollapsedChange).toHaveBeenCalledWith(false)
    })

    it('shows loading indicator in collapsed state', () => {
      mockHookState.loading = true
      mockHookState.sessions = []

      renderWithProviders(<ChatSessionsSidebar collapsed={true} />)

      // Should show loading spinner
      const spinner = document.querySelector('.animate-spin')
      expect(spinner).toBeInTheDocument()
    })
  })

  describe('Time Formatting', () => {
    it('displays relative time for recent sessions', () => {
      mockHookState.sessions = [
        {
          id: 'session-1',
          preview: 'Recent Session',
          metadata: { branch: 'main' },
          createdAt: Date.now() - 5 * 60 * 1000, // 5 minutes ago
          updatedAt: Date.now() - 5 * 60 * 1000,
        },
      ]

      renderWithProviders(<ChatSessionsSidebar />)

      expect(screen.getByText('5m ago')).toBeInTheDocument()
    })

    it('displays hours for sessions from today', () => {
      mockHookState.sessions = [
        {
          id: 'session-1',
          preview: 'Today Session',
          metadata: { branch: 'main' },
          createdAt: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
          updatedAt: Date.now() - 2 * 60 * 60 * 1000,
        },
      ]

      renderWithProviders(<ChatSessionsSidebar />)

      expect(screen.getByText('2h ago')).toBeInTheDocument()
    })

    it('displays days for sessions from this week', () => {
      mockHookState.sessions = [
        {
          id: 'session-1',
          preview: 'This Week Session',
          metadata: { branch: 'main' },
          createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000, // 3 days ago
          updatedAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
        },
      ]

      renderWithProviders(<ChatSessionsSidebar />)

      expect(screen.getByText('3d ago')).toBeInTheDocument()
    })
  })

  describe('Session Name Generation', () => {
    it('generates name from preview', () => {
      mockHookState.sessions = [
        {
          id: 'session-1',
          preview: 'Help with Salesforce',
          metadata: { branch: 'main' },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]

      renderWithProviders(<ChatSessionsSidebar />)

      expect(screen.getByText('Help with Salesforce')).toBeInTheDocument()
    })

    it('truncates long session names', () => {
      mockHookState.sessions = [
        {
          id: 'session-1',
          preview: 'This is a very long session name that should be truncated because it exceeds the maximum length',
          metadata: { branch: 'main' },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]

      renderWithProviders(<ChatSessionsSidebar />)

      // Should show truncated name (30 chars + ...)
      const sessionText = screen.getByText('This is a very long session na...')
      expect(sessionText).toBeInTheDocument()
    })

    it('falls back to "Chat N" when no preview', () => {
      mockHookState.sessions = [
        {
          id: 'session-1',
          metadata: { branch: 'main' },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]

      renderWithProviders(<ChatSessionsSidebar />)

      expect(screen.getByText('Chat 1')).toBeInTheDocument()
    })
  })
})
