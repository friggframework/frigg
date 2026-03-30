import React, { useState, useEffect, useCallback } from 'react'
import { User, Plus, Loader2, AlertCircle, Users, PenLine, ChevronRight } from 'lucide-react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Input } from '../ui/Input'

const UserSelection = ({
  isConnected = false,
  onUserSelect,
  userManagementMode = {},
  repositoryPath,
  compact = false
}) => {
  const [activeTab, setActiveTab] = useState('users')
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedUser, setSelectedUser] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [manualOrgId, setManualOrgId] = useState('')
  const [manualUserId, setManualUserId] = useState('')

  const sharedSecretEnabled = userManagementMode?.sharedSecretEnabled !== false

  useEffect(() => {
    if (isConnected) loadUsers()
  }, [isConnected])

  const loadUsers = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/frigg-app/admin/users?limit=50')
      const data = await res.json()
      if (res.ok && data.success) {
        setUsers(data.users || [])
      } else {
        setError(data.error || 'Failed to load users')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectUser = useCallback((user) => {
    setSelectedUser(user)
    setManualOrgId(user.organizationId || '')
    setManualUserId(user.appUserId || user.id || '')
    setError(null)
  }, [])

  const handleManualChange = useCallback((field, value) => {
    if (field === 'orgId') setManualOrgId(value)
    else setManualUserId(value)
    setSelectedUser(null)
    setError(null)
  }, [])

  const handleSelect = async () => {
    const orgId = manualOrgId.trim()
    const userId = manualUserId.trim()

    if (sharedSecretEnabled) {
      if (!orgId && !userId) {
        setError('At least one of App Org ID or App User ID is required')
        return
      }
      setSubmitting(true)
      try {
        const res = await fetch('/api/frigg-app/proxy/shared-secret', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            appOrgId: orgId,
            appUserId: userId,
            path: '/api/integrations',
            method: 'GET',
            repositoryPath
          })
        })
        const data = await res.json()
        if (res.ok && data.success) {
          onUserSelect?.({
            type: 'shared-secret',
            appOrgId: orgId,
            appUserId: userId,
            ...(selectedUser && { user: selectedUser })
          })
        } else {
          setError(data.error || 'Failed to authenticate')
        }
      } catch (err) {
        setError(err.message)
      } finally {
        setSubmitting(false)
      }
    } else {
      if (!selectedUser) {
        setError('Please select a user')
        return
      }
      setSubmitting(true)
      try {
        const res = await fetch(`/api/frigg-app/admin/users/${selectedUser.id}/impersonate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
        const data = await res.json()
        if (res.ok && data.success && data.token) {
          localStorage.setItem('frigg_auth_token', data.token)
          onUserSelect?.({
            type: 'token',
            token: data.token,
            user: selectedUser
          })
        } else {
          setError(data.error || 'Failed to impersonate')
        }
      } catch (err) {
        setError(err.message)
      } finally {
        setSubmitting(false)
      }
    }
  }

  if (!isConnected) {
    return (
      <div className={`flex items-center justify-center p-6 ${compact ? 'compact' : ''}`}>
        <div className="text-center text-muted-foreground">
          <AlertCircle className="mx-auto w-8 h-8 mb-2 opacity-50" />
          <p className="text-sm">Connect to Frigg app first</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className={`flex items-center justify-center p-6 ${compact ? 'compact' : ''}`}>
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading users...</span>
      </div>
    )
  }

  const canSelect = sharedSecretEnabled
    ? (manualOrgId.trim() || manualUserId.trim())
    : selectedUser

  return (
    <div className={`space-y-3 ${compact ? 'compact text-sm' : ''}`}>
      {sharedSecretEnabled && (
        <div className="flex gap-1 p-0.5 bg-muted rounded" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'users'}
            onClick={() => setActiveTab('users')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors
              ${activeTab === 'users' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Users className="w-3.5 h-3.5" />
            Users {users.length > 0 && <span className="text-[10px] opacity-60">({users.length})</span>}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'manual'}
            onClick={() => setActiveTab('manual')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors
              ${activeTab === 'manual' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <PenLine className="w-3.5 h-3.5" />
            Manual
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-2 text-xs bg-destructive/10 text-destructive rounded">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {activeTab === 'users' && (
        <>
          {users.length === 0 && !showCreateForm ? (
            <div className="text-center py-6">
              <User className="mx-auto w-8 h-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground mb-3">No users yet</p>
              <Button size="sm" onClick={() => setShowCreateForm(true)}>
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Create User
              </Button>
            </div>
          ) : showCreateForm ? (
            <CreateUserForm
              userManagementMode={userManagementMode}
              onCancel={() => setShowCreateForm(false)}
              onCreated={() => {
                setShowCreateForm(false)
                loadUsers()
              }}
            />
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {users.map(user => (
                <button
                  key={user.id}
                  onClick={() => handleSelectUser(user)}
                  className={`w-full flex items-center justify-between p-2 rounded border text-left transition-colors
                    ${selectedUser?.id === user.id
                      ? 'border-primary bg-primary/5'
                      : 'border-transparent hover:bg-muted/50'}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <User className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">
                        {user.username || user.email || user.appUserId || 'User'}
                      </div>
                      {(user.appUserId || user.organizationId) && (
                        <div className="text-[10px] text-muted-foreground truncate">
                          {user.organizationId && `Org: ${user.organizationId}`}
                          {user.organizationId && user.appUserId && ' · '}
                          {user.appUserId && `User: ${user.appUserId}`}
                        </div>
                      )}
                    </div>
                  </div>
                  <ChevronRight className={`w-4 h-4 flex-shrink-0 ${selectedUser?.id === user.id ? 'text-primary' : 'text-muted-foreground/50'}`} />
                </button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="w-full mt-1"
                onClick={() => setShowCreateForm(true)}
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Create User
              </Button>
            </div>
          )}
        </>
      )}

      {activeTab === 'manual' && (
        <div className="space-y-2">
          <div>
            <label className="text-xs font-medium mb-1 block" htmlFor="manual-org-id">
              App Org ID
            </label>
            <Input
              id="manual-org-id"
              value={manualOrgId}
              onChange={(e) => handleManualChange('orgId', e.target.value)}
              placeholder="org_123"
              className="h-8 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" htmlFor="manual-user-id">
              App User ID
            </label>
            <Input
              id="manual-user-id"
              value={manualUserId}
              onChange={(e) => handleManualChange('userId', e.target.value)}
              placeholder="user_456"
              className="h-8 text-sm"
            />
          </div>
        </div>
      )}

      {(selectedUser || activeTab === 'manual') && !showCreateForm && (
        <div className="pt-2 border-t">
          {selectedUser && activeTab === 'users' && (
            <div className="text-xs text-muted-foreground mb-2 space-y-0.5">
              {manualOrgId && <div>Org: <span className="font-mono">{manualOrgId}</span></div>}
              {manualUserId && <div>User: <span className="font-mono">{manualUserId}</span></div>}
            </div>
          )}
          <Button
            onClick={handleSelect}
            disabled={!canSelect || submitting}
            className="w-full h-8 text-sm"
          >
            {submitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              `Select ${sharedSecretEnabled ? 'Context' : 'User'}`
            )}
          </Button>
        </div>
      )}
    </div>
  )
}

const CreateUserForm = ({ userManagementMode, onCancel, onCreated }) => {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    appUserId: '',
    organizationId: ''
  })
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const sharedSecretEnabled = userManagementMode?.sharedSecretEnabled !== false
  const usePassword = userManagementMode?.usePassword

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (sharedSecretEnabled) {
      if (!formData.organizationId && !formData.appUserId) {
        setError('At least one of App Org ID or App User ID is required')
        return
      }
    } else {
      if (!formData.username && !formData.email) {
        setError('Username or email is required')
        return
      }
    }

    setSubmitting(true)
    try {
      const payload = {}
      if (formData.username) payload.username = formData.username
      if (formData.email) payload.email = formData.email
      if (formData.password) payload.password = formData.password
      if (formData.appUserId) payload.appUserId = formData.appUserId
      if (formData.organizationId) payload.organizationId = formData.organizationId

      const res = await fetch('/api/frigg-app/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (res.ok && data.success) {
        onCreated?.(data.user)
      } else {
        setError(data.error || 'Failed to create user')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const update = (field, value) => setFormData(prev => ({ ...prev, [field]: value }))

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {error && (
        <div className="flex items-center gap-2 p-2 text-xs bg-destructive/10 text-destructive rounded">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {sharedSecretEnabled ? (
        <>
          <div>
            <label className="text-xs font-medium mb-1 block" htmlFor="create-org-id">
              App Org ID <span className="text-destructive">*</span>
            </label>
            <Input
              id="create-org-id"
              value={formData.organizationId}
              onChange={(e) => update('organizationId', e.target.value)}
              placeholder="org_123"
              className="h-8 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" htmlFor="create-user-id">
              App User ID
            </label>
            <Input
              id="create-user-id"
              value={formData.appUserId}
              onChange={(e) => update('appUserId', e.target.value)}
              placeholder="user_456"
              className="h-8 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" htmlFor="create-username">
              Username <span className="text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="create-username"
              value={formData.username}
              onChange={(e) => update('username', e.target.value)}
              placeholder="john_doe"
              className="h-8 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" htmlFor="create-email">
              Email <span className="text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="create-email"
              type="email"
              value={formData.email}
              onChange={(e) => update('email', e.target.value)}
              placeholder="john@example.com"
              className="h-8 text-sm"
            />
          </div>
        </>
      ) : (
        <>
          <div>
            <label className="text-xs font-medium mb-1 block" htmlFor="create-username">
              Username <span className="text-destructive">*</span>
            </label>
            <Input
              id="create-username"
              value={formData.username}
              onChange={(e) => update('username', e.target.value)}
              placeholder="john_doe"
              className="h-8 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" htmlFor="create-email">
              Email
            </label>
            <Input
              id="create-email"
              type="email"
              value={formData.email}
              onChange={(e) => update('email', e.target.value)}
              placeholder="john@example.com"
              className="h-8 text-sm"
            />
          </div>
          {usePassword && (
            <div>
              <label className="text-xs font-medium mb-1 block" htmlFor="create-password">
                Password <span className="text-destructive">*</span>
              </label>
              <Input
                id="create-password"
                type="password"
                value={formData.password}
                onChange={(e) => update('password', e.target.value)}
                placeholder="••••••••"
                className="h-8 text-sm"
              />
            </div>
          )}
          <div>
            <label className="text-xs font-medium mb-1 block" htmlFor="create-org-id">
              App Org ID <span className="text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="create-org-id"
              value={formData.organizationId}
              onChange={(e) => update('organizationId', e.target.value)}
              placeholder="org_123"
              className="h-8 text-sm"
            />
          </div>
        </>
      )}

      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} className="flex-1 h-8">
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={submitting} className="flex-1 h-8">
          {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create'}
        </Button>
      </div>
    </form>
  )
}

export default UserSelection
