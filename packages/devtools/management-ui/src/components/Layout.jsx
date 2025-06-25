import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { 
  Home, 
  Plug, 
  Settings, 
  Users, 
  Link as LinkIcon,
  ChevronRight,
  Menu,
  X,
  Zap
} from 'lucide-react'
import { useFrigg } from '../hooks/useFrigg'
import StatusBadge from './StatusBadge'
import UserContextSwitcher from './UserContextSwitcher'
import { cn } from '../utils/cn'

const Layout = ({ children }) => {
  const location = useLocation()
  const { status, environment, users, currentUser, switchUserContext } = useFrigg()
  const [sidebarOpen, setSidebarOpen] = React.useState(false)

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'Integrations', href: '/integrations', icon: Plug },
    { name: 'Environment', href: '/environment', icon: Settings },
    { name: 'Users', href: '/users', icon: Users },
    { name: 'Connections', href: '/connections', icon: LinkIcon },
    { name: 'Simulation', href: '/simulation', icon: Zap },
  ]

  const closeSidebar = () => setSidebarOpen(false)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 fixed w-full top-0 z-30">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 lg:hidden"
              >
                <Menu size={24} />
              </button>
              <h1 className="text-2xl font-bold text-gray-900 ml-2 lg:ml-0">
                Frigg Management UI
              </h1>
              <div className="ml-4">
                <StatusBadge status={status} />
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <UserContextSwitcher 
                users={users}
                currentUser={currentUser}
                onUserSwitch={switchUserContext}
              />
              <select 
                className="block w-32 py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                value={environment}
                disabled
              >
                <option value="local">Local</option>
                <option value="staging">Staging</option>
                <option value="production">Production</option>
              </select>
            </div>
          </div>
        </div>
      </header>

      <div className="flex h-screen pt-16">
        {/* Desktop Sidebar */}
        <nav className="hidden lg:block w-64 bg-white shadow-sm border-r border-gray-200">
          <div className="px-4 py-4">
            <ul className="space-y-2">
              {navigation.map((item) => {
                const isActive = location.pathname === item.href
                const Icon = item.icon
                return (
                  <li key={item.name}>
                    <Link
                      to={item.href}
                      className={cn(
                        'flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors group',
                        isActive
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                      )}
                    >
                      <Icon size={20} className="mr-3" />
                      {item.name}
                      {isActive && (
                        <ChevronRight size={16} className="ml-auto" />
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        </nav>

        {/* Mobile Sidebar */}
        <nav className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-sm border-r border-gray-200 transform transition-transform duration-300 ease-in-out lg:hidden',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}>
          <div className="px-4 py-4 pt-20">
            <button
              onClick={closeSidebar}
              className="absolute top-4 right-4 p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
            >
              <X size={24} />
            </button>
            <ul className="space-y-2">
              {navigation.map((item) => {
                const isActive = location.pathname === item.href
                const Icon = item.icon
                return (
                  <li key={item.name}>
                    <Link
                      to={item.href}
                      onClick={closeSidebar}
                      className={cn(
                        'flex items-center px-4 py-2 text-sm font-medium rounded-md transition-colors group',
                        isActive
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                      )}
                    >
                      <Icon size={20} className="mr-3" />
                      {item.name}
                      {isActive && (
                        <ChevronRight size={16} className="ml-auto" />
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        </nav>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

export default Layout