import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/utils/test-utils'
import UserSelection from '../../presentation/components/shared/UserSelection'

const mockFetch = vi.fn()
global.fetch = mockFetch

describe('UserSelection', () => {
  const defaultProps = {
    isConnected: true,
    onUserSelect: vi.fn(),
    userManagementMode: {
      sharedSecretEnabled: true,
      usePassword: false
    },
    repositoryPath: '/test/repo'
  }

  const mockUsers = [
    { id: 'u1', username: 'alice', email: 'alice@test.com', appUserId: 'app-alice', organizationId: 'org-1' },
    { id: 'u2', username: 'bob', email: 'bob@test.com', appUserId: 'app-bob', organizationId: 'org-1' }
  ]

  beforeEach(() => {
    mockFetch.mockClear()
    defaultProps.onUserSelect.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  const mockUsersSuccess = () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, users: mockUsers })
    })
  }

  const mockUsersEmpty = () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, users: [] })
    })
  }

  describe('User List', () => {
    it('fetches and displays users when connected', async () => {
      mockUsersSuccess()
      renderWithProviders(<UserSelection {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument()
        expect(screen.getByText('bob')).toBeInTheDocument()
      })
    })

    it('shows empty state when no users', async () => {
      mockUsersEmpty()
      renderWithProviders(<UserSelection {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText(/no users/i)).toBeInTheDocument()
      })
    })

    it('shows connection required when not connected', () => {
      renderWithProviders(<UserSelection {...defaultProps} isConnected={false} />)
      expect(screen.getByText(/connect/i)).toBeInTheDocument()
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('shows loading state while fetching', async () => {
      let resolvePromise
      mockFetch.mockReturnValueOnce(new Promise(r => { resolvePromise = r }))

      renderWithProviders(<UserSelection {...defaultProps} />)
      expect(screen.getByText(/loading/i)).toBeInTheDocument()

      resolvePromise({ ok: true, json: () => Promise.resolve({ success: true, users: [] }) })
    })
  })

  describe('User Selection', () => {
    it('calls onUserSelect when selecting user in shared secret mode', async () => {
      mockUsersSuccess()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] })
      })

      const user = userEvent.setup()
      renderWithProviders(<UserSelection {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument()
      })

      await user.click(screen.getByText('alice'))
      await user.click(screen.getByRole('button', { name: /select/i }))

      await waitFor(() => {
        expect(defaultProps.onUserSelect).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'shared-secret',
            appUserId: 'app-alice',
            appOrgId: 'org-1'
          })
        )
      })
    })

    it('calls onUserSelect with token when using password auth mode', async () => {
      mockUsersSuccess()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, token: 'test-token' })
      })

      const user = userEvent.setup()
      const passwordProps = {
        ...defaultProps,
        userManagementMode: { sharedSecretEnabled: false, usePassword: true }
      }

      renderWithProviders(<UserSelection {...passwordProps} />)

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument()
      })

      await user.click(screen.getByText('alice'))
      await user.click(screen.getByRole('button', { name: /select/i }))

      await waitFor(() => {
        expect(defaultProps.onUserSelect).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'token',
            token: 'test-token'
          })
        )
      })
    })
  })

  describe('Create User Form - Shared Secret Mode', () => {
    it('shows create form when clicking create button', async () => {
      mockUsersEmpty()
      const user = userEvent.setup()

      renderWithProviders(<UserSelection {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /create/i }))

      expect(screen.getByLabelText(/app.*org.*id/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/app.*user.*id/i)).toBeInTheDocument()
    })

    it('requires at least one of appOrgId or appUserId in shared secret mode', async () => {
      mockUsersEmpty()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, user: { id: 'new-1' } })
      })

      const user = userEvent.setup()
      renderWithProviders(<UserSelection {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /create/i }))

      const submitBtn = screen.getByRole('button', { name: /^create$/i })
      await user.click(submitBtn)

      await waitFor(() => {
        expect(screen.getByText(/at least one.*required/i)).toBeInTheDocument()
      })
    })

    it('allows creation with just appOrgId', async () => {
      mockUsersEmpty()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, user: { id: 'new-1', organizationId: 'org-x' } })
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, users: [{ id: 'new-1', organizationId: 'org-x' }] })
      })

      const user = userEvent.setup()
      renderWithProviders(<UserSelection {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /create/i }))
      await user.type(screen.getByLabelText(/app.*org.*id/i), 'org-x')
      await user.click(screen.getByRole('button', { name: /^create$/i }))

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/frigg-app/admin/users'),
          expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('org-x')
          })
        )
      })
    })

    it('makes username/email optional in shared secret mode', async () => {
      mockUsersEmpty()
      const user = userEvent.setup()

      renderWithProviders(<UserSelection {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /create/i }))

      const usernameLabel = document.querySelector('label[for*="username"]')
      const emailLabel = document.querySelector('label[for*="email"]')

      expect(usernameLabel).not.toHaveTextContent('*')
      expect(emailLabel).not.toHaveTextContent('*')
    })
  })

  describe('Create User Form - Password Auth Mode', () => {
    const passwordProps = {
      ...defaultProps,
      userManagementMode: { sharedSecretEnabled: false, usePassword: true }
    }

    it('requires username or email in password mode', async () => {
      mockUsersEmpty()
      const user = userEvent.setup()

      renderWithProviders(<UserSelection {...passwordProps} />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /create/i }))
      await user.click(screen.getByRole('button', { name: /^create$/i }))

      await waitFor(() => {
        expect(screen.getByText(/username.*email.*required/i)).toBeInTheDocument()
      })
    })

    it('makes appOrgId/appUserId optional in password mode', async () => {
      mockUsersEmpty()
      const user = userEvent.setup()

      renderWithProviders(<UserSelection {...passwordProps} />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /create/i }))

      const orgIdLabel = document.querySelector('label[for*="org-id"]')
      const userIdLabel = document.querySelector('label[for*="user-id"]')

      if (orgIdLabel) expect(orgIdLabel).not.toHaveTextContent('*')
      if (userIdLabel) expect(userIdLabel).not.toHaveTextContent('*')
    })
  })

  describe('Manual Entry', () => {
    it('allows manual entry of appOrgId/appUserId without selecting user', async () => {
      mockUsersSuccess()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] })
      })

      const user = userEvent.setup()
      renderWithProviders(<UserSelection {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /manual/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('tab', { name: /manual/i }))

      const orgInput = screen.getByPlaceholderText(/org/i)
      const userInput = screen.getByPlaceholderText(/user/i)

      await user.type(orgInput, 'custom-org')
      await user.type(userInput, 'custom-user')
      await user.click(screen.getByRole('button', { name: /select/i }))

      await waitFor(() => {
        expect(defaultProps.onUserSelect).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'shared-secret',
            appOrgId: 'custom-org',
            appUserId: 'custom-user'
          })
        )
      })
    })
  })

  describe('Visual Density', () => {
    it('renders in compact mode when specified', async () => {
      mockUsersEmpty()
      const { container } = renderWithProviders(<UserSelection {...defaultProps} compact />)

      await waitFor(() => {
        expect(screen.getByText(/no users/i)).toBeInTheDocument()
      })

      const compactElement = container.querySelector('.compact')
      expect(compactElement).toBeInTheDocument()
      expect(compactElement).toHaveClass('text-sm')
    })
  })
})
