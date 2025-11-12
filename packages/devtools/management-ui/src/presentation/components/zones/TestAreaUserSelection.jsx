import React, { useState, useEffect } from 'react'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Badge } from '../ui/badge'
import { Input } from '../ui/input'
import { User, Plus, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { cn } from '../../../lib/utils'
import api from '../../../infrastructure/http/api-client'

/**
 * User selection/creation interface for Test Area
 * Allows selecting existing user or creating new one
 */
const TestAreaUserSelection = ({
  friggBaseUrl,
  onUserSelected,
  className
}) => {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const [error, setError] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newUser, setNewUser] = useState({
    email: '',
    username: ''
  })

  // Load users when component mounts AND friggBaseUrl is available
  useEffect(() => {
    if (friggBaseUrl) {
      console.log('TestAreaUserSelection mounted, loading users from:', friggBaseUrl)
      loadUsers()
    }
  }, [friggBaseUrl])

  const loadUsers = async () => {
    try {
      setLoading(true)
      setError(null)

      // Call the Frigg app's admin API directly
      const usersUrl = `${friggBaseUrl}/api/admin/users`
      console.log('Loading users from Frigg admin API:', usersUrl)

      const response = await fetch(usersUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      console.log('Admin users response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Failed to load users:', response.status, errorText)
        throw new Error(`Failed to load users: ${response.status}`)
      }

      const data = await response.json()
      console.log('Admin users response:', data)

      // Admin API returns { users: [...], pagination: {...} }
      const usersData = data?.users || []

      // Populate users with org info if available
      const usersWithOrg = usersData.map((user) => {
        // If user has organizationUser reference, include it
        if (user.organizationUser) {
          return {
            ...user,
            orgId: user.organizationUser,
            orgName: null // Will be populated when we add org fetch
          }
        }
        return user
      })

      setUsers(usersWithOrg)
    } catch (err) {
      console.error('Error loading users:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectUser = async (user) => {
    try {
      setLoggingIn(true)
      setError(null)

      console.log('Impersonating user:', user.username || user.email)

      // Use admin impersonation API to get token without password
      const impersonateUrl = `${friggBaseUrl}/api/admin/users/${user.id}/impersonate`
      console.log('Impersonation URL:', impersonateUrl)

      const response = await fetch(impersonateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          expiresInMinutes: 120
        })
      })

      console.log('Impersonation response status:', response.status)

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        const errorMessage = errorData?.message || `Impersonation failed: ${response.status}`
        console.error('Impersonation failed:', errorMessage)
        throw new Error(errorMessage)
      }

      const data = await response.json()
      console.log('Impersonation successful, token received:', data.token ? 'Yes' : 'No')

      // Pass user and token to parent
      onUserSelected({
        ...user,
        token: data.token
      })
    } catch (err) {
      console.error('Error impersonating user:', err)
      setError(err.message)
    } finally {
      setLoggingIn(false)
    }
  }

  const handleCreateUser = async (e) => {
    e.preventDefault()

    if (!newUser.email && !newUser.username) {
      setError('Please provide email or username')
      return
    }

    try {
      setCreating(true)
      setError(null)

      // Create user via RESTful Frigg API (POST /users)
      const response = await fetch(`${friggBaseUrl}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: newUser.username || newUser.email,
          password: 'defaultPassword123' // TODO: Let user set password
        })
      })

      if (!response.ok) {
        throw new Error('Failed to create user')
      }

      const data = await response.json()

      // User is created with token already, pass it to parent
      onUserSelected({
        username: newUser.username || newUser.email,
        token: data.token
      })

      // Reset form
      setNewUser({ email: '', username: '' })
      setShowCreateForm(false)
    } catch (err) {
      console.error('Error creating user:', err)
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className={cn('h-full flex items-center justify-center', className)}>
        <div className="text-center space-y-4">
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-muted-foreground/50" />
          <p className="text-muted-foreground">Loading users...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('h-full flex items-center justify-center p-8', className)}>
      <Card className="max-w-2xl w-full p-8">
        <div className="space-y-6">
          {/* Header */}
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                <User className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <h2 className="text-2xl font-bold mb-2">Select or Create User</h2>
            <p className="text-muted-foreground">
              Choose a user context for testing your integrations
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-2 p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/20 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-800 dark:text-red-200">{error}</div>
            </div>
          )}

          {/* Existing Users */}
          {users.length > 0 && !showCreateForm && (
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-muted-foreground">Existing Users</h3>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {users.map((user) => (
                  <button
                    key={user.id || user._id}
                    onClick={() => handleSelectUser(user)}
                    disabled={loggingIn}
                    className="w-full flex items-center justify-between p-4 border border-border rounded-lg hover:bg-accent/50 transition-colors text-left disabled:opacity-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <div className="font-medium">{user.username || user.email}</div>
                        {user.email && user.username && (
                          <div className="text-sm text-muted-foreground">{user.email}</div>
                        )}
                        {user.orgName && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Org: {user.orgName}
                          </div>
                        )}
                        {user.orgId && !user.orgName && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Org ID: {user.orgId.toString().slice(-8)}
                          </div>
                        )}
                      </div>
                    </div>
                    <CheckCircle className="w-5 h-5 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Create New User Form */}
          {showCreateForm ? (
            <form onSubmit={handleCreateUser} className="space-y-4">
              <h3 className="font-semibold text-sm text-muted-foreground">Create New User</h3>

              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Email</label>
                  <Input
                    type="email"
                    placeholder="user@example.com"
                    value={newUser.email}
                    onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-1.5 block">Username (optional)</label>
                  <Input
                    type="text"
                    placeholder="username"
                    value={newUser.username}
                    onChange={(e) => setNewUser(prev => ({ ...prev, username: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={creating}
                  className="flex-1"
                >
                  {creating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Create User
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateForm(false)}
                  disabled={creating}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowCreateForm(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Create New User
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}

export default TestAreaUserSelection