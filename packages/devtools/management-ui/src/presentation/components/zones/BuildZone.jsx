/**
 * BuildZone - AI-assisted integration development
 *
 * Uses assistant-ui for chat interface with streaming, markdown rendering,
 * and tool call display. Includes session sidebar for managing chat threads.
 */

import React, { useState, useEffect } from 'react'
import { Bot, FolderOpen, Settings, Cpu, Loader2, Bug, PanelLeftClose, PanelLeft } from 'lucide-react'
import { Button } from '../ui/button'
import { cn } from '../../../lib/utils'
import { useSocket } from '../../hooks/useSocket'
import { useAISettings, getProviderDisplayName, getModelDisplayName, providerRequiresApiKey } from '../../hooks/useAISettings'
import { useFrigg } from '../../hooks/useFrigg'
import RepositoryPicker from '../common/RepositoryPicker'
import SettingsModal from '../common/SettingsModal'
import ModelSelector from '../common/ModelSelector'
import { FriggRuntimeProvider } from '../chat/FriggRuntimeProvider'
import { AssistantThread } from '../chat/AssistantThread'
import { ChatSessionsSidebar } from '../chat/ChatSessionsSidebar'

// Debug mode helpers
const DEBUG_STORAGE_KEY = 'frigg:debug'
const getDebugMode = () => localStorage.getItem(DEBUG_STORAGE_KEY) === 'true'
const setDebugMode = (enabled) => {
  localStorage.setItem(DEBUG_STORAGE_KEY, enabled ? 'true' : 'false')
  // Also notify backend to enable verbose logging for this session
  return enabled
}

// Sidebar collapsed state persistence
const SIDEBAR_COLLAPSED_KEY = 'frigg:sidebar-collapsed'
const getSidebarCollapsed = () => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
const setSidebarCollapsed = (collapsed) => {
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? 'true' : 'false')
}

const BuildZone = ({ className }) => {
  const { socket, connected } = useSocket()
  const { aiConfig } = useAISettings()
  const { currentRepository, repositories, switchRepository, isLoading } = useFrigg()
  const [showSettings, setShowSettings] = useState(false)
  const [agentStatus, setAgentStatus] = useState({ checking: false, available: null, error: null })
  const [debugMode, setDebugModeState] = useState(getDebugMode)
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(getSidebarCollapsed)

  // Handle sidebar collapse toggle with persistence
  const handleSidebarCollapsedChange = (collapsed) => {
    setSidebarCollapsed(collapsed)
    setSidebarCollapsedState(collapsed)
  }

  // Check agent availability on mount and when provider changes
  useEffect(() => {
    if (!socket || !connected) return

    const checkAgentStatus = () => {
      setAgentStatus(prev => ({ ...prev, checking: true }))
      socket.emit('agent:status', { provider: aiConfig?.provider })
    }

    // Check on mount
    checkAgentStatus()

    // Listen for status response
    const handleStatusResponse = (data) => {
      setAgentStatus({
        checking: false,
        available: data.available,
        error: data.error || null
      })
    }

    socket.on('agent:status:response', handleStatusResponse)

    return () => {
      socket.off('agent:status:response', handleStatusResponse)
    }
  }, [socket, connected, aiConfig?.provider])

  // Determine connection status display
  const getConnectionStatus = () => {
    if (!connected) {
      return { color: 'bg-red-500', text: 'Disconnected', title: 'WebSocket disconnected from server' }
    }
    if (agentStatus.checking) {
      return { color: 'bg-yellow-500 animate-pulse', text: 'Checking...', title: 'Checking agent availability' }
    }
    if (agentStatus.available === false) {
      return { color: 'bg-red-500', text: 'Agent Unavailable', title: agentStatus.error || 'Agent not available' }
    }
    if (agentStatus.available === true) {
      return { color: 'bg-green-500', text: 'Agent Ready', title: 'Agent is available and ready' }
    }
    return { color: 'bg-yellow-500', text: 'Server Connected', title: 'Connected to server, agent status unknown' }
  }

  const connectionStatus = getConnectionStatus()

  // Toggle debug mode - updates localStorage and notifies backend
  const toggleDebugMode = () => {
    const newMode = !debugMode
    setDebugMode(newMode)
    setDebugModeState(newMode)

    // Notify backend to toggle verbose logging
    if (socket && connected) {
      socket.emit('agent:debug', { enabled: newMode })
    }

    // Log to console so user knows it's working
    if (newMode) {
      console.log('%c[Frigg Debug Mode ENABLED]', 'color: #a855f7; font-weight: bold', 'Verbose logging active. Check console for detailed agent events.')
    } else {
      console.log('%c[Frigg Debug Mode DISABLED]', 'color: #6b7280; font-weight: bold', 'Verbose logging disabled.')
    }
  }

  // Show repository selection prompt if no repository is selected
  if (!isLoading && !currentRepository) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full p-8', className)}>
        <div className="max-w-lg text-center space-y-6">
          <div className="w-20 h-20 mx-auto bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-center justify-center">
            <FolderOpen className="w-10 h-10 text-blue-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-foreground">Select a Repository</h2>
            <p className="text-muted-foreground">
              Choose a Frigg project to start building integrations with AI assistance.
            </p>
          </div>

          {repositories.length > 0 ? (
            <div className="flex justify-center">
              <RepositoryPicker
                currentRepo={currentRepository}
                onRepoChange={(repo) => {
                  if (repo?.id) {
                    switchRepository(repo.id)
                  }
                }}
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-muted/50 border border-border rounded-lg">
                <p className="text-sm text-muted-foreground">
                  No Frigg repositories found. Start the Management UI from within a Frigg project directory,
                  or create a new project using:
                </p>
                <code className="block mt-2 p-2 bg-background rounded text-sm font-mono text-foreground">
                  npx create-frigg-app my-project
                </code>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Check if AI is configured - some providers don't need an API key
  const isAIConfigured = !providerRequiresApiKey(aiConfig?.provider) || aiConfig?.apiKey

  if (!isAIConfigured) {
    return (
      <>
        <div className={cn('flex flex-col items-center justify-center h-full p-8', className)}>
          <div className="max-w-md text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
              <Bot className="w-8 h-8 text-purple-500" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">Configure AI Settings</h2>
            <p className="text-muted-foreground">
              To use the Build Zone, configure your AI provider in Settings. Choose "Claude Code (MAX Subscription)" if you have a Claude Pro/MAX subscription, or use an API key.
            </p>
            <Button variant="outline" onClick={() => setShowSettings(true)}>
              <Settings className="w-4 h-4 mr-2" />
              Open Settings
            </Button>
          </div>
        </div>
        <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
      </>
    )
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
            <Bot className="w-4 h-4 text-purple-500" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Build Zone</h2>
            <p className="text-xs text-muted-foreground">
              AI-assisted integration development
            </p>
          </div>
        </div>

        {/* Agent Info & Status */}
        <div className="flex items-center gap-4">
          {/* Provider & Model Info */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-lg border">
            <Cpu className="w-3.5 h-3.5 text-purple-500" />
            <div className="text-xs">
              <span className="text-muted-foreground">{getProviderDisplayName(aiConfig?.provider)}</span>
              <span className="mx-1.5 text-muted-foreground/50">•</span>
              <span className="font-medium text-foreground">{getModelDisplayName(aiConfig?.model, aiConfig?.provider)}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 ml-1"
              onClick={() => setShowSettings(true)}
              title="Configure AI Settings"
            >
              <Settings className="w-3 h-3 text-muted-foreground hover:text-foreground" />
            </Button>
          </div>

          {/* Model Selector */}
          <ModelSelector compact />

          {/* Debug Toggle */}
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-7 px-2 gap-1.5',
              debugMode && 'bg-purple-500/10 text-purple-500'
            )}
            onClick={toggleDebugMode}
            title={debugMode ? 'Debug mode ON - Click to disable verbose logging' : 'Debug mode OFF - Click to enable verbose logging'}
          >
            <Bug className={cn('w-3.5 h-3.5', debugMode ? 'text-purple-500' : 'text-muted-foreground')} />
            <span className="text-xs">{debugMode ? 'Debug ON' : 'Debug'}</span>
          </Button>

          {/* Agent Status */}
          <div
            className="flex items-center gap-2 text-xs text-muted-foreground cursor-help"
            title={connectionStatus.title}
          >
            {agentStatus.checking ? (
              <Loader2 className="w-3 h-3 animate-spin text-yellow-500" />
            ) : (
              <span className={cn('w-2 h-2 rounded-full', connectionStatus.color)} />
            )}
            {connectionStatus.text}
          </div>
        </div>
      </div>

      {/* Main content with sidebar and chat */}
      <div className="flex-1 overflow-hidden flex">
        <FriggRuntimeProvider>
          {/* Sessions Sidebar */}
          <ChatSessionsSidebar
            collapsed={sidebarCollapsed}
            onCollapsedChange={handleSidebarCollapsedChange}
          />

          {/* Chat Thread */}
          <AssistantThread className="flex-1 h-full" />
        </FriggRuntimeProvider>
      </div>

      {/* Settings Modal */}
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  )
}

export default BuildZone
