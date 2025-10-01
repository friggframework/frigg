import React, { useState } from 'react'
import { Settings as SettingsIcon, Palette, Code, Monitor, Moon, Sun, Check, ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { useTheme } from '../components/theme/ThemeProvider'
import { useIDE } from '../hooks/useIDE'
import { cn } from '../../lib/utils'

const Settings = () => {
  const [activeTab, setActiveTab] = useState('appearance')
  const { theme, setTheme } = useTheme()
  const { preferredIDE, availableIDEs, setIDE } = useIDE()
  const [showCustomDialog, setShowCustomDialog] = useState(false)
  const [customCommand, setCustomCommand] = useState('')

  const tabs = [
    {
      id: 'appearance',
      name: 'Appearance',
      icon: Palette,
      description: 'Theme and visual preferences'
    },
    {
      id: 'editor',
      name: 'Editor Integration',
      icon: Code,
      description: 'IDE and editor settings'
    }
  ]

  const themeOptions = [
    {
      id: 'light',
      name: 'Light',
      description: 'Clean industrial light theme',
      icon: Sun
    },
    {
      id: 'dark',
      name: 'Dark',
      description: 'Dark industrial theme',
      icon: Moon
    },
    {
      id: 'system',
      name: 'System',
      description: 'Match system preference',
      icon: Monitor
    }
  ]

  const handleIDESelect = (ide) => {
    if (ide.id === 'custom') {
      setShowCustomDialog(true)
      return
    }
    setIDE(ide)
  }

  const handleCustomCommand = () => {
    if (!customCommand.trim()) return

    const customIDE = {
      id: 'custom',
      name: 'Custom Command',
      command: customCommand.trim()
    }

    setIDE(customIDE)
    setShowCustomDialog(false)
    setCustomCommand('')
  }

  return (
    <div className="min-h-full bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="px-6 py-4">
          <div className="flex items-center gap-4">
            <Link to="/dashboard">
              <Button variant="ghost" size="icon" className="hover:bg-muted">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary/10 border border-primary/20 flex items-center justify-center">
                <SettingsIcon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground">Settings</h1>
                <p className="text-sm text-muted-foreground">Configure Frigg Management UI</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar Navigation */}
        <div className="w-80 min-h-[calc(100vh-5rem)] bg-muted/30 border-r border-border">
          <nav className="p-4 space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 text-left transition-all duration-200",
                    "border border-transparent hover:border-border hover:bg-background/50",
                    isActive && "bg-background border-border shadow-sm"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 flex items-center justify-center border",
                    isActive ? "bg-primary/10 border-primary/20" : "bg-background border-border"
                  )}>
                    <Icon className={cn(
                      "w-4 h-4",
                      isActive ? "text-primary" : "text-muted-foreground"
                    )} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={cn(
                      "text-sm font-medium",
                      isActive ? "text-foreground" : "text-muted-foreground"
                    )}>
                      {tab.name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {tab.description}
                    </div>
                  </div>
                </button>
              )
            })}
          </nav>

          {/* Version Info */}
          <div className="absolute bottom-4 left-4 right-4 max-w-72 p-3 bg-background/50 border border-border">
            <div className="text-xs text-muted-foreground">
              <div className="font-medium">Frigg Management UI</div>
              <div>Framework v2.0+</div>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-6">

          {/* Appearance Tab */}
          {activeTab === 'appearance' && (
            <div className="max-w-2xl space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-2">Theme Preference</h2>
                <p className="text-muted-foreground mb-6">
                  Choose your visual theme for the Frigg Management UI
                </p>

                <div className="grid gap-3">
                  {themeOptions.map((option) => {
                    const Icon = option.icon
                    const isSelected = theme === option.id
                    return (
                      <button
                        key={option.id}
                        onClick={() => setTheme(option.id)}
                        className={cn(
                          "flex items-center gap-4 p-4 text-left border transition-all duration-200",
                          "hover:border-primary/30 hover:bg-primary/5",
                          isSelected && "border-primary/50 bg-primary/10"
                        )}
                      >
                        <div className={cn(
                          "w-10 h-10 flex items-center justify-center border",
                          isSelected ? "bg-primary/20 border-primary/30" : "bg-background border-border"
                        )}>
                          <Icon className={cn(
                            "w-5 h-5",
                            isSelected ? "text-primary" : "text-muted-foreground"
                          )} />
                        </div>
                        <div className="flex-1">
                          <div className={cn(
                            "font-medium",
                            isSelected ? "text-primary" : "text-foreground"
                          )}>
                            {option.name}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {option.description}
                          </div>
                        </div>
                        {isSelected && (
                          <Check className="w-5 h-5 text-primary" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="border-t border-border pt-6">
                <h3 className="font-medium text-foreground mb-2">Color Scheme</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Industrial design with Frigg brand colors
                </p>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-primary border border-border" title="Primary - Frigg Green" />
                  <div className="w-6 h-6 bg-secondary border border-border" title="Secondary - Industrial Gray" />
                  <div className="w-6 h-6 bg-accent border border-border" title="Accent - Dark Green" />
                  <div className="w-6 h-6 bg-muted border border-border" title="Muted - Light Gray" />
                  <span className="text-xs text-muted-foreground ml-2">Frigg Industrial Palette</span>
                </div>
              </div>
            </div>
          )}

          {/* Editor Integration Tab */}
          {activeTab === 'editor' && (
            <div className="max-w-2xl space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-2">Preferred IDE</h2>
                <p className="text-muted-foreground mb-6">
                  Choose your preferred IDE for opening generated code files
                </p>

                <div className="grid gap-2">
                  {availableIDEs.map((ide) => {
                    const isSelected = preferredIDE?.id === ide.id
                    return (
                      <button
                        key={ide.id}
                        onClick={() => handleIDESelect(ide)}
                        className={cn(
                          "flex items-center gap-3 p-3 text-left border transition-all duration-200",
                          "hover:border-primary/30 hover:bg-primary/5",
                          isSelected && "border-primary/50 bg-primary/10"
                        )}
                      >
                        <div className={cn(
                          "w-8 h-8 flex items-center justify-center border",
                          isSelected ? "bg-primary/20 border-primary/30" : "bg-background border-border"
                        )}>
                          <Code className={cn(
                            "w-4 h-4",
                            isSelected ? "text-primary" : "text-muted-foreground"
                          )} />
                        </div>
                        <div className="flex-1">
                          <div className={cn(
                            "font-medium text-sm",
                            isSelected ? "text-primary" : "text-foreground"
                          )}>
                            {ide.name}
                          </div>
                          {ide.command && (
                            <div className="text-xs text-muted-foreground font-mono">
                              {ide.command}
                            </div>
                          )}
                        </div>
                        {isSelected && (
                          <Check className="w-4 h-4 text-primary" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {preferredIDE && (
                <div className="border-t border-border pt-6">
                  <h3 className="font-medium text-foreground mb-2">Current Selection</h3>
                  <div className="p-4 bg-muted/30 border border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <Code className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <div className="font-medium text-sm">{preferredIDE.name}</div>
                        {preferredIDE.command && (
                          <div className="text-xs text-muted-foreground font-mono">
                            Command: {preferredIDE.command}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Custom Command Dialog */}
      {showCustomDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border shadow-xl p-6 w-96">
            <h3 className="text-lg font-semibold text-card-foreground mb-4">
              Custom IDE Command
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Enter the command to open your preferred IDE with a file path.
              Use <code className="bg-muted px-1 font-mono text-xs">{"{path}"}</code> as a placeholder.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Command
                </label>
                <input
                  type="text"
                  value={customCommand}
                  onChange={(e) => setCustomCommand(e.target.value)}
                  placeholder="e.g., 'code {path}' or 'subl {path}'"
                  className="w-full px-3 py-2 border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  autoFocus
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowCustomDialog(false)
                    setCustomCommand('')
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCustomCommand}
                  disabled={!customCommand.trim()}
                >
                  Save
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Settings