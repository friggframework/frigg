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
  Zap,
  BarChart3,
  Code,
  Layers
} from 'lucide-react'
import { useFrigg } from '../hooks/useFrigg'
import StatusBadge from './StatusBadge'
import UserContextSwitcher from './UserContextSwitcher'
import RepositoryPicker from './RepositoryPicker'
import { ThemeToggle } from './theme-toggle'
import { cn } from '../lib/utils'
import FriggLogo from '../assets/FriggLogo.svg'

const Layout = ({ children }) => {
  const location = useLocation()
  const { status, environment, users, currentUser, switchUserContext } = useFrigg()
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const [currentRepository, setCurrentRepository] = React.useState(null)

  // Get initial repository info from API
  React.useEffect(() => {
    const fetchCurrentRepo = async () => {
      try {
        const response = await fetch('/api/repository/current')
        const data = await response.json()
        if (data.data?.repository) {
          setCurrentRepository(data.data.repository)
        }
      } catch (e) {
        console.error('Failed to fetch repository info:', e)
      }
    }
    fetchCurrentRepo()
  }, [])

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'Integrations', href: '/integrations', icon: Plug },
    { name: 'Code Generation', href: '/code-generation', icon: Code },
    { name: 'Environment', href: '/environment', icon: Settings },
    { name: 'Users', href: '/users', icon: Users },
    { name: 'Connections', href: '/connections', icon: LinkIcon },
    { name: 'Simulation', href: '/simulation', icon: Zap },
    { name: 'Monitoring', href: '/monitoring', icon: BarChart3 },
  ]

  const closeSidebar = () => setSidebarOpen(false)

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* Header with industrial design */}
      <header className="fixed w-full top-0 z-30 bg-card/90 backdrop-blur-md border-b industrial-border industrial-shadow">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-3">
            <div className="flex items-center">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent/50 industrial-transition lg:hidden sharp-button"
              >
                <Menu size={24} />
              </button>

              {/* Frigg Logo and Title */}
              <div className="flex items-center gap-3 ml-2 lg:ml-0">
                <img
                  src={FriggLogo}
                  alt="Frigg"
                  className="h-8 w-auto"
                />
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-foreground">
                    Frigg
                  </h1>
                  <span className="text-sm font-medium text-muted-foreground">
                    Management UI
                  </span>
                </div>
              </div>

              <div className="ml-4">
                <StatusBadge status={status} />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <RepositoryPicker
                currentRepo={currentRepository}
                onRepoChange={setCurrentRepository}
              />
              <UserContextSwitcher
                users={users}
                currentUser={currentUser}
                onUserSwitch={switchUserContext}
              />
              <select
                className="h-9 px-3 text-sm bg-background border industrial-border industrial-input focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 industrial-transition"
                value={environment}
                disabled
              >
                <option value="local">Local</option>
                <option value="staging">Staging</option>
                <option value="production">Production</option>
              </select>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <div className="flex h-screen pt-14">
        {/* Desktop Sidebar with industrial styling */}
        <nav className="hidden lg:block w-64 bg-card border-r industrial-border industrial-shadow-lg">
          <div className="px-3 py-4">
            {/* Industrial accent line */}
            <div className="h-1 w-full bg-gradient-to-r from-primary/20 via-primary to-primary/20 rounded-full mb-4" />

            <ul className="space-y-1">
              {navigation.map((item) => {
                const isActive = location.pathname === item.href
                const Icon = item.icon
                return (
                  <li key={item.name}>
                    <Link
                      to={item.href}
                      className={cn(
                        'flex items-center px-3 py-2 text-sm font-medium industrial-transition group relative overflow-hidden sharp-button',
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-md'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                      )}
                    >
                      {/* Industrial hover effect */}
                      {!isActive && (
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                      )}

                      <Icon size={18} className="mr-3" />
                      {item.name}
                      {isActive && (
                        <ChevronRight size={16} className="ml-auto" />
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>

            {/* Bottom industrial accent */}
            <div className="mt-8 pt-8 border-t industrial-border">
              <div className="flex items-center justify-center text-muted-foreground">
                <Layers size={16} className="mr-2" />
                <span className="text-xs font-medium uppercase tracking-wider">
                  Powered by Frigg
                </span>
              </div>
            </div>
          </div>
        </nav>

        {/* Mobile Sidebar */}
        <nav className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-card border-r industrial-border transform transition-transform duration-300 ease-in-out lg:hidden',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}>
          <div className="px-3 py-4 pt-20">
            <button
              onClick={closeSidebar}
              className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground hover:bg-accent industrial-transition sharp-button"
            >
              <X size={24} />
            </button>

            {/* Industrial accent line */}
            <div className="h-1 w-full bg-gradient-to-r from-primary/20 via-primary to-primary/20 rounded-full mb-4" />

            <ul className="space-y-1">
              {navigation.map((item) => {
                const isActive = location.pathname === item.href
                const Icon = item.icon
                return (
                  <li key={item.name}>
                    <Link
                      to={item.href}
                      onClick={closeSidebar}
                      className={cn(
                        'flex items-center px-3 py-2 text-sm font-medium industrial-transition group relative overflow-hidden sharp-button',
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-md'
                          : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                      )}
                    >
                      {/* Industrial hover effect */}
                      {!isActive && (
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                      )}

                      <Icon size={18} className="mr-3" />
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

        {/* Main content with industrial styling */}
        <main className="flex-1 overflow-y-auto bg-background">
          <div className="p-4 sm:p-6 lg:p-8">
            {/* Industrial grid pattern overlay */}
            <div className="fixed inset-0 pointer-events-none opacity-[0.02] dark:opacity-[0.04]" style={{
              backgroundImage: `linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px),
                               linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px)`,
              backgroundSize: '20px 20px'
            }} />

            <div className="relative">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export { Layout }
export default Layout