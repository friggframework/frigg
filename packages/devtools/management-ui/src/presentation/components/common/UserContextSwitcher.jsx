import React, { useState, useRef, useEffect } from 'react'
import { User, ChevronDown, UserCircle } from 'lucide-react'
import { cn } from '../lib/utils'
import { cn } from '../lib/utils'

const UserContextSwitcher = ({ users, currentUser, onUserSwitch }) => {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleUserSelect = (user) => {
    onUserSwitch(user)
    setIsOpen(false)
  }

  const clearContext = () => {
    onUserSwitch(null)
    setIsOpen(false)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
          currentUser 
            ? "bg-blue-100 text-blue-700 hover:bg-blue-200" 
            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
        )}
      >
        {currentUser ? (
          <>
            <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs">
              {currentUser.firstName?.[0]}{currentUser.lastName?.[0]}
            </div>
            <span className="max-w-[150px] truncate">
              {currentUser.firstName} {currentUser.lastName}
            </span>
          </>
        ) : (
          <>
            <UserCircle size={20} />
            <span>No User Context</span>
          </>
        )}
        <ChevronDown size={16} className={cn(
          "transition-transform",
          isOpen && "rotate-180"
        )} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          <div className="p-3 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">Switch User Context</h3>
            <p className="text-xs text-gray-500 mt-1">
              Simulate integration behavior as different users
            </p>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {users.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">
                No users available. Create a test user first.
              </div>
            ) : (
              <>
                {currentUser && (
                  <button
                    onClick={clearContext}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center space-x-3 border-b border-gray-100"
                  >
                    <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">
                      <User size={16} className="text-gray-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Clear Context</p>
                      <p className="text-xs text-gray-500">Use default system context</p>
                    </div>
                  </button>
                )}
                
                {users.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleUserSelect(user)}
                    className={cn(
                      "w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center space-x-3",
                      currentUser?.id === user.id && "bg-blue-50"
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium",
                      currentUser?.id === user.id 
                        ? "bg-blue-600 text-white" 
                        : "bg-gray-300 text-gray-700"
                    )}>
                      {user.firstName?.[0]}{user.lastName?.[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {user.firstName} {user.lastName}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{user.email}</p>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                          {user.role}
                        </span>
                        {user.appOrgId && (
                          <span className="text-xs text-gray-500">
                            Org: {user.appOrgId}
                          </span>
                        )}
                      </div>
                    </div>
                    {currentUser?.id === user.id && (
                      <div className="text-blue-600">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </button>
                ))}
              </>
            )}
          </div>

          {currentUser && (
            <div className="p-3 bg-gray-50 border-t border-gray-200">
              <p className="text-xs text-gray-600">
                <span className="font-medium">Current context:</span> {currentUser.appUserId || currentUser.email}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default UserContextSwitcher