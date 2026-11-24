import React, { useState } from 'react'
import { useFrigg } from '../hooks/useFrigg'
import SessionMonitor from '../components/SessionMonitor'

const Users = () => {
  const { users, createUser, updateUser, deleteUser, bulkCreateUsers, deleteAllUsers } = useFrigg()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [activeTab, setActiveTab] = useState('users')
  const [formData, setFormData] = useState({
    email: '',
    firstName: '',
    lastName: '',
    role: 'user',
    appUserId: '',
    appOrgId: ''
  })

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editingUser) {
        await updateUser(editingUser.id, formData)
        setEditingUser(null)
      } else {
        await createUser(formData)
      }
      setFormData({ email: '', firstName: '', lastName: '', role: 'user', appUserId: '', appOrgId: '' })
      setShowCreateForm(false)
    } catch (error) {
      console.error(editingUser ? 'Error updating user:' : 'Error creating user:', error)
    }
  }

  const handleEdit = (user) => {
    setEditingUser(user)
    setFormData({
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      appUserId: user.appUserId || '',
      appOrgId: user.appOrgId || ''
    })
    setShowCreateForm(true)
  }

  const handleDelete = async (userId) => {
    try {
      await deleteUser(userId)
      setShowDeleteConfirm(null)
    } catch (error) {
      console.error('Error deleting user:', error)
    }
  }

  const handleBulkCreate = async () => {
    try {
      await bulkCreateUsers(10)
    } catch (error) {
      console.error('Error creating bulk users:', error)
    }
  }

  const handleDeleteAll = async () => {
    if (window.confirm('Are you sure you want to delete all users? This action cannot be undone.')) {
      try {
        await deleteAllUsers()
      } catch (error) {
        console.error('Error deleting all users:', error)
      }
    }
  }

  const generateTestId = (user) => {
    return `test_user_${user.email.split('@')[0].replace(/\./g, '_')}`
  }

  // Filter users based on search and filters
  const filteredUsers = users.filter(user => {
    const matchesSearch = searchTerm === '' || 
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.appUserId && user.appUserId.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (user.appOrgId && user.appOrgId.toLowerCase().includes(searchTerm.toLowerCase()))
    
    const matchesRole = filterRole === '' || user.role === filterRole
    const matchesStatus = filterStatus === '' || user.status === filterStatus
    
    return matchesSearch && matchesRole && matchesStatus
  })

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900">Test User Management</h2>
        <p className="mt-2 text-gray-600">Create and manage dummy users for testing integrations</p>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('users')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'users'
                ? 'border-frigg-blue text-frigg-blue'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Users ({users.length})
          </button>
          <button
            onClick={() => setActiveTab('sessions')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'sessions'
                ? 'border-frigg-blue text-frigg-blue'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Active Sessions
          </button>
        </nav>
      </div>

      {activeTab === 'users' ? (
        <>
          {/* Action Buttons */}
          <div className="mb-6 flex space-x-4">
        {!showCreateForm ? (
          <>
            <button
              onClick={() => setShowCreateForm(true)}
              className="px-4 py-2 bg-frigg-blue text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              + Create Test User
            </button>
            <button
              onClick={handleBulkCreate}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            >
              Generate 10 Users
            </button>
            {users.length > 0 && (
              <button
                onClick={handleDeleteAll}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                Delete All Users
              </button>
            )}
          </>
        ) : (
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              {editingUser ? 'Edit User' : 'Create New Test User'}
            </h3>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    First Name
                  </label>
                  <input
                    type="text"
                    name="firstName"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-frigg-blue"
                    value={formData.firstName}
                    onChange={handleInputChange}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    name="lastName"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-frigg-blue"
                    value={formData.lastName}
                    onChange={handleInputChange}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-frigg-blue"
                    value={formData.email}
                    onChange={handleInputChange}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role
                  </label>
                  <select
                    name="role"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-frigg-blue"
                    value={formData.role}
                    onChange={handleInputChange}
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                    <option value="developer">Developer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    App User ID
                  </label>
                  <input
                    type="text"
                    name="appUserId"
                    placeholder="e.g., app_user_123"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-frigg-blue"
                    value={formData.appUserId}
                    onChange={handleInputChange}
                  />
                  <p className="text-xs text-gray-500 mt-1">Optional: External app user identifier</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    App Org ID
                  </label>
                  <input
                    type="text"
                    name="appOrgId"
                    placeholder="e.g., app_org_456"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-frigg-blue"
                    value={formData.appOrgId}
                    onChange={handleInputChange}
                  />
                  <p className="text-xs text-gray-500 mt-1">Optional: External organization identifier</p>
                </div>
              </div>
              <div className="mt-4 flex space-x-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  {editingUser ? 'Update User' : 'Create User'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false)
                    setEditingUser(null)
                    setFormData({ email: '', firstName: '', lastName: '', role: 'user', appUserId: '', appOrgId: '' })
                  }}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Search and Filters */}
      <div className="mb-6 bg-white shadow rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              placeholder="Search by name, email, or IDs..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-frigg-blue"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Role</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-frigg-blue"
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
            >
              <option value="">All Roles</option>
              <option value="user">User</option>
              <option value="admin">Admin</option>
              <option value="developer">Developer</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Status</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-frigg-blue"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
        {(searchTerm || filterRole || filterStatus) && (
          <div className="mt-3 flex items-center text-sm text-gray-600">
            <span>Showing {filteredUsers.length} of {users.length} users</span>
            <button
              onClick={() => {
                setSearchTerm('')
                setFilterRole('')
                setFilterStatus('')
              }}
              className="ml-4 text-frigg-blue hover:text-blue-700"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* Users List */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                App User ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                App Org ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Connections
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                  {users.length === 0 ? 'No users created yet' : 'No users match your filters'}
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => (
              <tr key={user.id || user.email}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10">
                      <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                        <span className="text-gray-600 font-medium">
                          {user.firstName?.[0]}{user.lastName?.[0]}
                        </span>
                      </div>
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">
                        {user.firstName} {user.lastName}
                      </div>
                      <div className="text-sm text-gray-500">
                        {user.email}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <code className="text-sm font-mono text-gray-600">{user.appUserId || generateTestId(user)}</code>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <code className="text-sm font-mono text-gray-600">{user.appOrgId || 'N/A'}</code>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                    {user.role}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {user.connections?.length || 0} active
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => handleEdit(user)}
                    className="text-frigg-blue hover:text-blue-700 mr-3"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(user.id)}
                    className="text-red-600 hover:text-red-900"
                  >
                    Delete
                  </button>
                </td>
              </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Confirm Delete</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this user? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(showDeleteConfirm)}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Delete User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-yellow-700">
              Test users are for local development only. They simulate real users for testing integration flows 
              without requiring actual authentication.
            </p>
          </div>
        </div>
      </div>
        </>
      ) : (
        <>
          {/* Sessions Tab Content */}
          <SessionMonitor />
          
          {/* Sessions Info Box */}
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-blue-700">
                  Sessions track user activity during development testing. Each session expires after 1 hour of inactivity
                  and can be refreshed to extend the duration.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default Users