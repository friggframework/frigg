import React, { useState, useEffect } from 'react'
import { Button } from '../ui/button'
import { Card } from '../ui/card'
import { Input } from '../ui/input'
import { User, Plus, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { cn } from '../../../lib/utils'
import api from '../../../infrastructure/http/api-client'

const TestAreaUserSelection = ({
  isConnected = false,
  onUserSelected,
  className
}) => {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const [error, setError] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newUser, setNewUser] = useState({ email: '', username: '' })

  useEffect(() => {
    if (isConnected) {
      loadUsers()
    }
  }, [isConnected])

  const loadUsers = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await api.get('/api/frigg-app/admin/users')
      if (response.data.success) {
        setUsers(response.data.users || [])
      } else {
        setError(response.data.error || 'Failed to load users')
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectUser = async (user) => {
    try {
      setLoggingIn(true)
      setError(null)

      const userId = user.id || user._id

      const response = await api.post(`/api/frigg-app/admin/users/${userId}/impersonate`)
      if (response.data.success && response.data.token) {
        localStorage.setItem('frigg_auth_token', response.data.token)
        onUserSelected({ ...user, token: response.data.token })
      } else {
        setError(response.data.error || 'Impersonation failed')
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message)
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

      const userData = {
        username: newUser.username || newUser.email,
        email: newUser.email
      }

      const response = await api.post('/api/frigg-app/admin/users', userData)
      if (response.data.success) {
        setNewUser({ email: '', username: '' })
        setShowCreateForm(false)
        await loadUsers()
        if (response.data.user?.id) {
          await handleSelectUser(response.data.user)
        }
      } else {
        setError(response.data.error || 'Failed to create user')
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message)
    } finally {
      setCreating(false)
    }
  }

  if (!isConnected) {
    return (
      <div className={cn('h-full flex items-center justify-center', className)}>
        <div className="text-center space-y-4">
          <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="text-muted-foreground">
            Connect to a Frigg app first
          </p>
        </div>
      </div>
    )
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

          {error && (
            <div className="flex items-start gap-2 p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/20 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-800 dark:text-red-200">{error}</div>
            </div>
          )}

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
                      </div>
                    </div>
                    <CheckCircle className="w-5 h-5 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>
          )}

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
                <Button type="submit" disabled={creating} className="flex-1">
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
