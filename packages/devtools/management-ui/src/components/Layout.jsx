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
                repository={currentRepository}
                onRepositoryChange={setCurrentRepository}
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
                        "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 industrial-transition group",
                        isActive
                          ? "bg-primary text-primary-foreground shadow-md industrial-shadow"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                      )}
                    >
                      <Icon
                        size={18}
                        className={cn(
                          "shrink-0 transition-transform duration-200",
                          isActive ? "scale-110" : "group-hover:scale-105"
                        )}
                      />
                      <span className="truncate">{item.name}</span>
                      {isActive && (
                        <ChevronRight
                          size={14}
                          className="ml-auto shrink-0 opacity-70"
                        />
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        </nav>

        {/* Mobile Sidebar */}
        {sidebarOpen && (
          <nav className="fixed inset-y-0 left-0 z-50 w-64 bg-card border-r industrial-border industrial-shadow-lg lg:hidden">
            <div className="flex items-center justify-between p-4 border-b industrial-border">
              <div className="flex items-center gap-2">
                <img
                  src={FriggLogo}
                  alt="Frigg"
                  className="h-6 w-auto"
                />
                <span className="font-semibold text-foreground">Frigg</span>
              </div>
              <button
                onClick={closeSidebar}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-md industrial-transition"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="px-3 py-4">
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
                          "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-all duration-200 industrial-transition group",
                          isActive
                            ? "bg-primary text-primary-foreground shadow-md industrial-shadow"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                        )}
                      >
                        <Icon
                          size={18}
                          className={cn(
                            "shrink-0 transition-transform duration-200",
                            isActive ? "scale-110" : "group-hover:scale-105"
                          )}
                        />
                        <span className="truncate">{item.name}</span>
                        {isActive && (
                          <ChevronRight
                            size={14}
                            className="ml-auto shrink-0 opacity-70"
                          />
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          </nav>
        )}

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