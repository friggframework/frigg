import React, { useState, useEffect } from 'react'
import { ChevronDown, Check, Settings, RefreshCw, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { useIDE } from '../../hooks/useIDE'

const IDESelector = ({ onSelect, currentPath, showAvailabilityStatus = true }) => {
    const [isOpen, setIsOpen] = useState(false)
    const [showCustomDialog, setShowCustomDialog] = useState(false)
    const [customCommand, setCustomCommand] = useState('')
    const [showAllIDEs, setShowAllIDEs] = useState(false)
    const {
        preferredIDE,
        availableIDEs,
        setIDE,
        openInIDE,
        isDetecting,
        error,
        getIDEsByCategory,
        getAvailableIDEs,
        refreshIDEDetection
    } = useIDE()

    // Get IDEs to display based on filter
    const idesToDisplay = showAllIDEs ? availableIDEs : getAvailableIDEs()
    const categorizedIDEs = getIDEsByCategory()

    const handleIDESelect = async (ide) => {
        if (ide.id === 'custom') {
            setShowCustomDialog(true)
            return
        }

        // Check if IDE is available before selecting
        if (!ide.available && ide.id !== 'custom') {
            console.warn(`IDE ${ide.name} is not available: ${ide.reason}`)
            // Still allow selection for manual configuration
        }

        setIDE(ide)
        setIsOpen(false)

        if (onSelect) {
            onSelect(ide)
        }

        if (currentPath) {
            try {
                await openInIDE(currentPath)
            } catch (error) {
                console.error('Failed to open in IDE:', error)
            }
        }
    }

    const handleCustomCommand = async () => {
        if (!customCommand.trim()) return

        const customIDE = {
            id: 'custom',
            name: 'Custom Command',
            command: customCommand.trim(),
            available: true
        }

        setIDE(customIDE)
        setShowCustomDialog(false)
        setIsOpen(false)

        if (onSelect) {
            onSelect(customIDE)
        }

        if (currentPath) {
            try {
                await openInIDE(currentPath)
            } catch (error) {
                console.error('Failed to open in IDE:', error)
            }
        }
    }

    const handleRefreshDetection = async () => {
        try {
            await refreshIDEDetection()
        } catch (error) {
            console.error('Failed to refresh IDE detection:', error)
        }
    }

    // Status icon for IDE availability
    const getStatusIcon = (ide) => {
        if (!showAvailabilityStatus) return null

        if (ide.id === 'custom') {
            return <CheckCircle className="h-3 w-3 text-green-500" />
        }

        if (ide.available) {
            return <CheckCircle className="h-3 w-3 text-green-500" />
        } else {
            return <XCircle className="h-3 w-3 text-red-500" />
        }
    }

    // Group IDEs by category for better organization
    const renderIDEGroup = (categoryName, ides) => {
        if (ides.length === 0) return null

        const categoryLabels = {
            popular: 'Popular IDEs',
            jetbrains: 'JetBrains IDEs',
            terminal: 'Terminal Editors',
            mobile: 'Mobile Development',
            apple: 'Apple Development',
            java: 'Java Development',
            windows: 'Windows Only',
            deprecated: 'Deprecated',
            other: 'Other IDEs'
        }

        return (
            <div key={categoryName} className="py-1">
                {categoryName !== 'popular' && (
                    <div className="px-4 py-1 text-xs font-medium text-muted-foreground bg-muted/50">
                        {categoryLabels[categoryName] || categoryName}
                    </div>
                )}
                {ides.map((ide) => (
                    <button
                        key={ide.id}
                        onClick={() => handleIDESelect(ide)}
                        disabled={!ide.available && ide.id !== 'custom'}
                        className={cn(
                            "w-full px-4 py-2 text-left hover:bg-accent/50 flex items-center gap-3",
                            "disabled:opacity-50 disabled:cursor-not-allowed",
                            preferredIDE?.id === ide.id && "bg-accent",
                            !ide.available && ide.id !== 'custom' && "opacity-60"
                        )}
                        title={ide.available ? `Open with ${ide.name}` : `${ide.name}: ${ide.reason}`}
                    >
                        {preferredIDE?.id === ide.id ? (
                            <Check className="h-4 w-4 text-primary" />
                        ) : (
                            <div className="h-4 w-4" />
                        )}
                        <span className="text-sm text-foreground flex-1">{ide.name}</span>
                        {getStatusIcon(ide)}
                    </button>
                ))}
            </div>
        )
    }

    return (
        <>
            <div className="relative">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className={cn(
                        "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md",
                        "bg-background border border-border hover:bg-accent",
                        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                        "transition-colors duration-150",
                        isDetecting && "opacity-75"
                    )}
                    title="Select IDE"
                    disabled={isDetecting}
                >
                    {isDetecting ? (
                        <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin" />
                    ) : (
                        <Settings className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="text-foreground">
                        {preferredIDE?.name || 'Select IDE'}
                    </span>
                    {preferredIDE && showAvailabilityStatus && (
                        <>
                            {preferredIDE.available ? (
                                <CheckCircle className="h-3 w-3 text-green-500" />
                            ) : (
                                <AlertTriangle className="h-3 w-3 text-yellow-500" />
                            )}
                        </>
                    )}
                    <ChevronDown className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform duration-200",
                        isOpen && "transform rotate-180"
                    )} />
                </button>

                {isOpen && (
                    <div className="absolute z-50 mt-2 w-80 rounded-md shadow-lg bg-popover border border-border max-h-96 overflow-y-auto">
                        {/* Header with controls */}
                        <div className="px-4 py-2 border-b border-border bg-muted/20">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-foreground">IDE Selection</span>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleRefreshDetection}
                                        disabled={isDetecting}
                                        className="p-1 hover:bg-accent rounded"
                                        title="Refresh IDE detection"
                                    >
                                        <RefreshCw className={cn(
                                            "h-3 w-3 text-muted-foreground",
                                            isDetecting && "animate-spin"
                                        )} />
                                    </button>
                                    <button
                                        onClick={() => setShowAllIDEs(!showAllIDEs)}
                                        className="text-xs text-muted-foreground hover:text-foreground"
                                        title={showAllIDEs ? "Show only available IDEs" : "Show all IDEs"}
                                    >
                                        {showAllIDEs ? "Available Only" : "Show All"}
                                    </button>
                                </div>
                            </div>
                            {error && (
                                <div className="mt-1 text-xs text-red-500 flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3" />
                                    Detection error: {error}
                                </div>
                            )}
                        </div>

                        {/* IDE Categories */}
                        <div className="py-1">
                            {showAllIDEs ? (
                                // Show categorized view
                                <>
                                    {renderIDEGroup('popular', categorizedIDEs.popular)}
                                    {renderIDEGroup('jetbrains', categorizedIDEs.jetbrains)}
                                    {renderIDEGroup('terminal', categorizedIDEs.terminal)}
                                    {renderIDEGroup('mobile', categorizedIDEs.mobile)}
                                    {renderIDEGroup('apple', categorizedIDEs.apple)}
                                    {renderIDEGroup('java', categorizedIDEs.java)}
                                    {renderIDEGroup('windows', categorizedIDEs.windows)}
                                    {renderIDEGroup('deprecated', categorizedIDEs.deprecated)}
                                    {renderIDEGroup('other', categorizedIDEs.other)}
                                </>
                            ) : (
                                // Show only available IDEs
                                idesToDisplay.map((ide) => (
                                    <button
                                        key={ide.id}
                                        onClick={() => handleIDESelect(ide)}
                                        className={cn(
                                            "w-full px-4 py-2 text-left hover:bg-accent/50 flex items-center gap-3",
                                            preferredIDE?.id === ide.id && "bg-accent"
                                        )}
                                        title={ide.available ? `Open with ${ide.name}` : `${ide.name}: ${ide.reason}`}
                                    >
                                        {preferredIDE?.id === ide.id ? (
                                            <Check className="h-4 w-4 text-primary" />
                                        ) : (
                                            <div className="h-4 w-4" />
                                        )}
                                        <span className="text-sm text-foreground flex-1">{ide.name}</span>
                                        {getStatusIcon(ide)}
                                    </button>
                                ))
                            )}

                            {idesToDisplay.length === 0 && (
                                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                                    <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                                    <p>No {showAllIDEs ? '' : 'available '}IDEs found</p>
                                    <p className="text-xs mt-1">
                                        {showAllIDEs ? 'Try refreshing detection' : 'Click "Show All" to see all IDEs'}
                                    </p>
                                </div>
                            )}

                            {/* Custom Command option - always at bottom */}
                            <div className="border-t border-border">
                                <button
                                    onClick={() => handleIDESelect({ id: 'custom', name: 'Custom Command', available: true })}
                                    className={cn(
                                        "w-full px-4 py-2 text-left hover:bg-accent/50 flex items-center gap-3",
                                        preferredIDE?.id === 'custom' && "bg-accent"
                                    )}
                                >
                                    {preferredIDE?.id === 'custom' ? (
                                        <Check className="h-4 w-4 text-primary" />
                                    ) : (
                                        <div className="h-4 w-4" />
                                    )}
                                    <span className="text-sm text-foreground flex-1">Custom Command</span>
                                    <CheckCircle className="h-3 w-3 text-green-500" />
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Custom Command Dialog */}
            {showCustomDialog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-card border border-border rounded-lg p-6 w-[500px] max-w-[90vw] max-h-[90vh] overflow-y-auto">
                        <h3 className="text-lg font-semibold text-card-foreground mb-4">
                            Custom IDE Command
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <p className="text-sm text-muted-foreground mb-2">
                                    Enter the command to open your preferred IDE with a file path.
                                    Use <code className="bg-muted px-1 rounded text-xs">{"{path}"}</code> as a placeholder for the file path.
                                </p>

                                {/* Security Information */}
                                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-3 mb-4">
                                    <div className="flex items-start gap-2">
                                        <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                                        <div className="text-xs text-yellow-800 dark:text-yellow-200">
                                            <p className="font-medium mb-1">Security Notice:</p>
                                            <ul className="space-y-1 list-disc list-inside">
                                                <li>Commands are validated for security</li>
                                                <li>Shell metacharacters are blocked</li>
                                                <li>File paths are restricted to safe locations</li>
                                                <li>Only use trusted IDE commands</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>

                                {/* Examples */}
                                <div className="mb-4">
                                    <p className="text-xs font-medium text-foreground mb-2">Examples:</p>
                                    <div className="space-y-1 text-xs text-muted-foreground">
                                        <div className="font-mono bg-muted px-2 py-1 rounded">code {"{path}"}</div>
                                        <div className="font-mono bg-muted px-2 py-1 rounded">subl {"{path}"}</div>
                                        <div className="font-mono bg-muted px-2 py-1 rounded">webstorm {"{path}"}</div>
                                        <div className="font-mono bg-muted px-2 py-1 rounded">idea {"{path}"}</div>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-foreground mb-2">
                                    Command
                                </label>
                                <input
                                    type="text"
                                    value={customCommand}
                                    onChange={(e) => setCustomCommand(e.target.value)}
                                    placeholder="Enter your IDE command with {path} placeholder"
                                    className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-ring font-mono text-sm"
                                    autoFocus
                                />

                                {/* Real-time validation feedback */}
                                {customCommand && (
                                    <div className="mt-2 text-xs">
                                        {customCommand.includes('{path}') ? (
                                            <div className="text-green-600 dark:text-green-400 flex items-center gap-1">
                                                <CheckCircle className="h-3 w-3" />
                                                Command includes {'{path}'} placeholder
                                            </div>
                                        ) : (
                                            <div className="text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                                                <AlertTriangle className="h-3 w-3" />
                                                Consider adding {'{path}'} placeholder for file path
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-2 justify-end pt-2">
                                <button
                                    onClick={() => {
                                        setShowCustomDialog(false)
                                        setCustomCommand('')
                                    }}
                                    className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCustomCommand}
                                    disabled={!customCommand.trim()}
                                    className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    Save & Use
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

export default IDESelector
