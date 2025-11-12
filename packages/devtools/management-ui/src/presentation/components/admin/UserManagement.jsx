import React, { useState, useEffect, useMemo } from 'react'
import { UserPlus, Search, RefreshCw, ChevronRight, Trash2 } from 'lucide-react'
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
  const [deletingUserId, setDeletingUserId] = useState(null)
  const [userToDelete, setUserToDelete] = useState(null)

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

      console.log('Admin impersonating user:', user.username || user.email)

      // Use admin impersonation API to get token without password
      const response = await fetch(`${friggBaseUrl}/api/admin/users/${user.id}/impersonate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          expiresInMinutes: 120
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        const errorMessage = errorData?.message || `Failed to impersonate user: ${response.status}`
        console.error('Impersonation failed:', errorMessage)
        throw new Error(errorMessage)
      }

      const data = await response.json()
      console.log('User impersonation successful, got token')

      // Pass user with token to parent
      onUserSelect({
        ...user,
        token: data.token
      })
    } catch (err) {
      console.error('Error impersonating user:', err)
      setError(`Failed to impersonate user: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteClick = (user, event) => {
    event.stopPropagation() // Prevent triggering user selection
    setUserToDelete(user)
  }

  const handleDeleteConfirm = async () => {
    if (!userToDelete) return

    try {
      setDeletingUserId(userToDelete.id)
      setError(null)

      await adminService.deleteUser(userToDelete.id)

      // Remove user from list
      setUsers(prev => prev.filter(u => u.id !== userToDelete.id))
      setUserToDelete(null)
    } catch (err) {
      console.error('Failed to delete user:', err)
      setError(`Failed to delete user: ${err.message}`)
    } finally {
      setDeletingUserId(null)
    }
  }

  const handleDeleteCancel = () => {
    setUserToDelete(null)
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
                <div className="space-y-1 flex-1">
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => handleDeleteClick(user, e)}
                    disabled={deletingUserId === user.id}
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                    title="Delete user"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
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

      {/* Delete Confirmation Dialog */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <Card className="max-w-md w-full mx-4">
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Delete User</h3>
                <p className="text-sm text-muted-foreground">
                  Are you sure you want to delete user <strong>{userToDelete.getDisplayName()}</strong>?
                  This action cannot be undone.
                </p>
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={handleDeleteCancel}
                  disabled={!!deletingUserId}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteConfirm}
                  disabled={!!deletingUserId}
                >
                  {deletingUserId ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

export default UserManagement
