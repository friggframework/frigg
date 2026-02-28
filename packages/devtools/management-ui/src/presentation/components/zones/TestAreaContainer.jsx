import React, { useState, useCallback } from 'react'
import { Card } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import {
  ExternalLink,
  Maximize2,
  Minimize2,
  Chrome,
  MoreVertical,
  RefreshCw,
  Lock,
  ChevronDown,
  Check
} from 'lucide-react'
import { cn } from '../../../lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'

// Import IntegrationHub - complete integration management in one component
import { IntegrationHub } from '@friggframework/ui'
import '@friggframework/ui/dist/style.css'

/**
 * TestAreaContainer - Desktop browser mockup container
 * Complete User View - IntegrationHub provides all integration management
 *
 * Features (via IntegrationHub):
 * - Integration Gallery with search/filter
 * - Connected Accounts management
 * - Build Integration wizard
 */
const TestAreaContainer = ({
  friggBaseUrl,
  authToken,
  selectedUser,
  onBackToUserSelection,
  allUsers = [],
  onUserSwitch,
  className
}) => {
  // Debug: Log props
  React.useEffect(() => {
    console.log('TestAreaContainer - Props:', {
      friggBaseUrl,
      authToken: authToken ? `${authToken.substring(0, 20)}...` : 'undefined',
      selectedUser: selectedUser?.username || selectedUser?.email,
      allUsersCount: allUsers.length
    })
  }, [friggBaseUrl, authToken, selectedUser, allUsers])

  const [isFullscreen, setIsFullscreen] = useState(false)
  const [componentKey, setComponentKey] = useState(0)

  const handleNavigateToSampleData = useCallback((integrationId) => {
    console.log('Navigate to sample data for integration:', integrationId)
  }, [])

  const handleRefresh = useCallback(() => {
    // Re-render IntegrationHub by updating key
    setComponentKey(prev => prev + 1)
  }, [])

  const handleIntegrationCreated = useCallback((integration) => {
    console.log('Integration created:', integration)
  }, [])

  const handleError = useCallback((error) => {
    console.error('IntegrationHub error:', error)
  }, [])

  return (
    <>
      {/* Fullscreen Modal Overlay */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-background">
          <Card className="h-full w-full flex flex-col overflow-hidden border-0 rounded-none shadow-none">
            {/* Browser Chrome Header */}
            <div className="flex-shrink-0 border-b bg-muted/30 h-12">
              <div className="h-full flex items-center justify-between px-4">
                {/* Left: Browser Controls */}
                <div className="flex items-center gap-3">
                  {/* Traffic Light Buttons (macOS style) */}
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500/80 hover:bg-red-500 cursor-pointer" onClick={() => setIsFullscreen(false)} />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/80 hover:bg-yellow-500 cursor-pointer" />
                    <div className="w-3 h-3 rounded-full bg-green-500/80 hover:bg-green-500 cursor-pointer" />
                  </div>

                  {/* Browser Icon */}
                  <Chrome className="w-4 h-4 text-muted-foreground" />
                </div>

                {/* Center: Address Bar */}
                <div className="flex-1 max-w-2xl mx-4">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-background border rounded-lg shadow-sm">
                    <Lock className="w-3 h-3 text-green-600" />
                    <span className="text-sm text-muted-foreground truncate flex-1">
                      {friggBaseUrl}
                    </span>
                    <Badge variant="outline" className="flex items-center gap-1 text-xs px-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                      Live
                    </Badge>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRefresh}
                    className="h-8 w-8 p-0"
                    title="Refresh"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(friggBaseUrl, '_blank')}
                    className="h-8 px-3"
                    title="Open in new tab"
                  >
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                    <span className="text-xs">Open</span>
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsFullscreen(false)}
                    className="h-8 w-8 p-0"
                    title="Exit fullscreen"
                  >
                    <Minimize2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* User Context Bar */}
              <div className="border-t bg-muted/20 px-4 py-2 flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  Viewing as: <span className="font-medium text-foreground">{selectedUser?.username || selectedUser?.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  {allUsers.length > 0 ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-6 px-2 text-xs gap-1">
                          Switch User
                          <ChevronDown className="w-3 h-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuLabel>Switch User</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {allUsers.map((user) => (
                          <DropdownMenuItem
                            key={user.id}
                            onClick={() => onUserSwitch && onUserSwitch(user)}
                            className="flex items-center justify-between"
                          >
                            <span className="truncate">{user.username || user.email}</span>
                            {selectedUser?.id === user.id && (
                              <Check className="w-3 h-3 ml-2" />
                            )}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={onBackToUserSelection}>
                          Back to User Selection
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onBackToUserSelection}
                      className="h-6 px-2 text-xs"
                    >
                      Switch User
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Browser Content Area - IntegrationHub handles everything */}
            <div className="flex-1 overflow-hidden bg-background">
              <div className="h-full overflow-auto">
                <div className="min-h-full p-8">
                  {!authToken ? (
                    <div className="p-8 text-center">
                      <p className="text-muted-foreground">No authentication token available. Please select a user.</p>
                      <Button onClick={onBackToUserSelection} className="mt-4">
                        Back to User Selection
                      </Button>
                    </div>
                  ) : (
                    <IntegrationHub
                      key={`hub-fullscreen-${componentKey}`}
                      friggBaseUrl={friggBaseUrl}
                      authToken={authToken}
                      onIntegrationCreated={handleIntegrationCreated}
                      onError={handleError}
                      navigateToSampleDataFn={handleNavigateToSampleData}
                      showSearch={true}
                      showCategoryFilter={true}
                      componentLayout="default-vertical"
                    />
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Normal View (when not fullscreen) */}
      <div className={cn(
        'h-full flex flex-col transition-all duration-300',
        isFullscreen ? 'hidden' : 'p-2 sm:p-4 lg:p-6',
        className
      )}>
        {/* Desktop Browser Mockup */}
        <Card className={cn(
          'flex-1 flex flex-col overflow-hidden transition-all duration-300',
          'border-2 shadow-2xl',
          'border-border rounded-lg sm:rounded-xl',
          'bg-background'
        )}>
          {/* Browser Chrome Header */}
          <div className="flex-shrink-0 border-b bg-muted/30 h-12 sm:h-14">
          <div className="h-full flex items-center justify-between px-2 sm:px-4">
            {/* Left: Browser Controls */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Traffic Light Buttons (macOS style) */}
              {(isFullscreen || window.innerWidth >= 640) && (
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-red-500/80 hover:bg-red-500 cursor-pointer" />
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-yellow-500/80 hover:bg-yellow-500 cursor-pointer" />
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-green-500/80 hover:bg-green-500 cursor-pointer" />
                </div>
              )}

              {/* Browser Icon */}
              <Chrome className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
            </div>

            {/* Center: Address Bar */}
            <div className="flex-1 max-w-xs sm:max-w-md lg:max-w-2xl mx-2 sm:mx-4">
              <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-background border rounded-md sm:rounded-lg shadow-sm">
                <Lock className="hidden sm:block w-3 h-3 text-green-600" />
                <span className="text-xs sm:text-sm text-muted-foreground truncate flex-1">
                  {friggBaseUrl}
                </span>
                <Badge variant="outline" className="flex items-center gap-1 text-[10px] sm:text-xs px-1 sm:px-1.5">
                  <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-green-500 animate-pulse" />
                  <span className="hidden sm:inline">Live</span>
                </Badge>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-1 sm:gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                title="Refresh"
              >
                <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open(friggBaseUrl, '_blank')}
                className="hidden sm:flex h-8 px-3"
                title="Open in new tab"
              >
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                <span className="text-xs">Open</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              >
                {isFullscreen ? (
                  <Minimize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                )}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="hidden sm:flex h-8 w-8 p-0"
                title="More options"
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* User Context Bar */}
          {!isFullscreen && (
            <div className="hidden sm:flex border-t bg-muted/20 px-4 py-2 items-center justify-between">
              <div className="text-xs text-muted-foreground">
                Viewing as: <span className="font-medium text-foreground">{selectedUser?.username || selectedUser?.email}</span>
              </div>
              <div className="flex items-center gap-2">
                {allUsers.length > 0 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-6 px-2 text-xs gap-1">
                        Switch User
                        <ChevronDown className="w-3 h-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuLabel>Switch User</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {allUsers.map((user) => (
                        <DropdownMenuItem
                          key={user.id}
                          onClick={() => onUserSwitch && onUserSwitch(user)}
                          className="flex items-center justify-between"
                        >
                          <span className="truncate">{user.username || user.email}</span>
                          {selectedUser?.id === user.id && (
                            <Check className="w-3 h-3 ml-2" />
                          )}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={onBackToUserSelection}>
                        Back to User Selection
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onBackToUserSelection}
                    className="h-6 px-2 text-xs"
                  >
                    Switch User
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Browser Content Area - IntegrationHub handles everything */}
        <div className="flex-1 overflow-hidden bg-background">
          <div className="h-full overflow-auto">
            <div className={cn(
              'min-h-full',
              isFullscreen ? 'p-4 sm:p-6 lg:p-8' : 'p-3 sm:p-4 lg:p-6'
            )}>
              {/* User Context Header (mobile only) */}
              <div className="sm:hidden mb-4 pb-4 border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground">Logged in as</div>
                    <div className="font-semibold">{selectedUser?.username || selectedUser?.email}</div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onBackToUserSelection}
                  >
                    Switch User
                  </Button>
                </div>
              </div>

              {/* IntegrationHub - Complete integration management */}
              {!authToken ? (
                <div className="p-8 text-center">
                  <p className="text-muted-foreground">No authentication token available. Please select a user.</p>
                  <Button onClick={onBackToUserSelection} className="mt-4">
                    Back to User Selection
                  </Button>
                </div>
              ) : (
                <IntegrationHub
                  key={`hub-normal-${componentKey}`}
                  friggBaseUrl={friggBaseUrl}
                  authToken={authToken}
                  onIntegrationCreated={handleIntegrationCreated}
                  onError={handleError}
                  navigateToSampleDataFn={handleNavigateToSampleData}
                  showSearch={true}
                  showCategoryFilter={true}
                  componentLayout="default-vertical"
                />
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
    </>
  )
}

export default TestAreaContainer
