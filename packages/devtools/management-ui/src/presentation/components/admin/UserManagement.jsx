import React, { useState, useEffect, useMemo } from 'react'
import { UserPlus, Search, RefreshCw, ChevronRight } from 'lucide-react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { LoadingSpinner } from '@friggframework/ui'
import CreateUserModal from './CreateUserModal'
import { AdminService } from '../../../application/services/AdminService'
import { AdminRepositoryAdapter } from '../../../infrastructure/adapters/AdminRepositoryAdapter'
import axios from 'axios'

/**
 * UserManagement
 * Admin view for managing users with organization associations
 * Features:
 * - List all users with pagination
 * - Search users
 * - Create new users
 * - Select user to view as (switches to User View)
 */
const UserManagement = ({ friggBaseUrl, onUserSelect }) => {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0 })
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [error, setError] = useState(null)

  // Create axios client for Frigg API
  const friggApiClient = useMemo(() => {
    return axios.create({
      baseURL: friggBaseUrl,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }, [friggBaseUrl])

  // Initialize admin service
  const adminRepository = useMemo(() => new AdminRepositoryAdapter(friggApiClient), [friggApiClient])
  const adminService = useMemo(() => new AdminService(adminRepository), [adminRepository])

  // Load users on mount and when pagination changes
  useEffect(() => {
    loadUsers()
  }, [pagination.page])

  const loadUsers = async () => {
    try {
      setLoading(true)
      setError(null)

      const result = await adminService.listUsers({
        page: pagination.page,
        limit: pagination.limit,
        sortBy: 'createdAt',
        sortOrder: 'desc'
      })

      setUsers(result.users)
      setPagination(prev => ({ ...prev, total: result.pagination.total }))
    } catch (err) {
      console.error('Failed to load users:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      loadUsers()
      return
    }

    try {
      setLoading(true)
      setError(null)

      const result = await adminService.searchUsers(searchQuery, {
        page: 1,
        limit: pagination.limit
      })

      setUsers(result.users)
      setPagination(prev => ({ ...prev, page: 1, total: result.pagination.total }))
    } catch (err) {
      console.error('Failed to search users:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateUser = async (userData) => {
    try {
      await adminService.createUser(userData)
      setShowCreateModal(false)
      loadUsers() // Refresh list
    } catch (err) {
      console.error('Failed to create user:', err)
      throw err
    }
  }

  const handleUserClick = async (user) => {
    if (!onUserSelect) return

    try {
      setLoading(true)
      setError(null)

      console.log('Admin selecting user, logging in:', user.username || user.email)

      // Login to get JWT token
      let response = await fetch(`${friggBaseUrl}/users/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: user.username || user.email,
          password: 'defaultPassword123' // TODO: Handle password properly
        })
      })

      // If login fails, user might not have password set - create new user with same username
      if (!response.ok) {
        console.warn('Login failed, attempting to create user with default password')

        response = await fetch(`${friggBaseUrl}/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            username: user.username || user.email,
            password: 'defaultPassword123'
          })
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error('User creation also failed:', response.status, errorText)
          throw new Error(`Failed to login or create user: ${response.status}`)
        }
      }

      const data = await response.json()
      console.log('User authenticated successfully, got token')

      // Pass user with token to parent
      onUserSelect({
        ...user,
        token: data.token
      })
    } catch (err) {
      console.error('Error authenticating user:', err)
      setError(`Failed to authenticate as user: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const filteredUsers = users

  return (
    <div className="user-management space-y-4">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search users by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-9"
            />
          </div>
          <Button
            onClick={handleSearch}
            variant="outline"
            size="sm"
          >
            Search
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={loadUsers}
            variant="outline"
            size="sm"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            onClick={() => setShowCreateModal(true)}
            size="sm"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Create User
          </Button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <Card className="bg-destructive/10 border-destructive/50">
          <div className="p-4 text-sm text-destructive">
            Error: {error}
          </div>
        </Card>
      )}

      {/* User list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : filteredUsers.length === 0 ? (
        <Card>
          <div className="p-8 text-center text-muted-foreground">
            {searchQuery ? 'No users found matching your search.' : 'No users yet. Create one to get started.'}
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredUsers.map(user => (
            <Card
              key={user.id}
              className="hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => handleUserClick(user)}
            >
              <div className="p-4 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{user.getDisplayName()}</span>
                    {user.type && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        {user.type}
                      </span>
                    )}
                  </div>
                  {user.email && user.username && (
                    <div className="text-sm text-muted-foreground">{user.email}</div>
                  )}
                  {user.organizationName && (
                    <div className="text-xs text-muted-foreground">
                      Organization: {user.organizationName}
                    </div>
                  )}
                  {user.createdAt && (
                    <div className="text-xs text-muted-foreground">
                      Created: {new Date(user.createdAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">View as user</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.total > pagination.limit && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {(pagination.page - 1) * pagination.limit + 1}-
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} users
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
              disabled={pagination.page === 1}
              variant="outline"
              size="sm"
            >
              Previous
            </Button>
            <Button
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
              disabled={pagination.page * pagination.limit >= pagination.total}
              variant="outline"
              size="sm"
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateUser}
        />
      )}
    </div>
  )
}

export default UserManagement
