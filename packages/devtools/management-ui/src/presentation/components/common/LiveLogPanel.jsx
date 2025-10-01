import React, { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { cn } from '../../../lib/utils'
import {
  Terminal,
  Download,
  Trash2,
  Play,
  Pause,
  Filter,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Info,
  CheckCircle,
  XCircle,
  Clock,
  Copy,
  Check
} from 'lucide-react'

const LiveLogPanel = ({
  logs = [],
  onClear,
  onDownload,
  isStreaming = false,
  onToggleStreaming,
  className
}) => {
  const [isPaused, setIsPaused] = useState(false)
  const [selectedLevel, setSelectedLevel] = useState('all')
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [copied, setCopied] = useState(false)
  const logContainerRef = useRef(null)

  const logLevels = [
    { id: 'all', label: 'All', color: 'bg-gray-500' },
    { id: 'error', label: 'Error', color: 'bg-red-500' },
    { id: 'warn', label: 'Warning', color: 'bg-yellow-500' },
    { id: 'info', label: 'Info', color: 'bg-blue-500' },
    { id: 'debug', label: 'Debug', color: 'bg-gray-500' },
    { id: 'success', label: 'Success', color: 'bg-green-500' }
  ]

  const getLogIcon = (level) => {
    switch (level) {
      case 'error': return <XCircle className="w-3 h-3 text-red-500" />
      case 'warn': return <AlertCircle className="w-3 h-3 text-yellow-500" />
      case 'info': return <Info className="w-3 h-3 text-blue-500" />
      case 'success': return <CheckCircle className="w-3 h-3 text-green-500" />
      default: return <Clock className="w-3 h-3 text-gray-500" />
    }
  }

  const getLogLevelColor = (level) => {
    switch (level) {
      case 'error': return 'text-red-600 dark:text-red-400'
      case 'warn': return 'text-yellow-600 dark:text-yellow-400'
      case 'info': return 'text-blue-600 dark:text-blue-400'
      case 'success': return 'text-green-600 dark:text-green-400'
      default: return 'text-gray-600 dark:text-gray-400'
    }
  }

  // Filter logs based on selected level
  const filteredLogs = selectedLevel === 'all'
    ? logs
    : logs.filter(log => log.level === selectedLevel)

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logContainerRef.current && !isPaused) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [filteredLogs, autoScroll, isPaused])

  const handleScroll = () => {
    if (logContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 5
      setAutoScroll(isAtBottom)
    }
  }

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    })
  }

  // Format logs for clipboard copy
  const getFormattedLogsForClipboard = () => {
    return filteredLogs.map(log => {
      const timestamp = new Date(log.timestamp).toISOString()
      const level = log.level.toUpperCase().padEnd(7)
      const source = log.source ? `[${log.source}]` : ''
      return `${timestamp} ${level} ${source} ${log.message}`
    }).join('\n')
  }

  const handleCopy = async () => {
    try {
      const formattedLogs = getFormattedLogsForClipboard()
      await navigator.clipboard.writeText(formattedLogs)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy logs:', err)
    }
  }

  const handleTogglePause = () => {
    const newPaused = !isPaused
    setIsPaused(newPaused)
    if (newPaused) {
      onToggleStreaming?.(false)
    } else {
      onToggleStreaming?.(true)
    }
  }

  if (isCollapsed) {
    return (
      <div className={cn('border-t border-border bg-card', className)}>
        <div className="flex items-center justify-between p-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsCollapsed(false)}
            className="flex items-center gap-2"
          >
            <ChevronRight className="w-4 h-4" />
            <Terminal className="w-4 h-4" />
            Logs ({filteredLogs.length})
          </Button>

          <div className="flex items-center gap-1">
            {isStreaming && (
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            )}
            <Badge variant="outline" className="text-xs">
              {selectedLevel === 'all' ? 'All levels' : selectedLevel}
            </Badge>
          </div>
        </div>
      </div>
    )
  }

  return (
    <Card className={cn('border-t-2 border-t-primary/20', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsCollapsed(true)}
              className="p-1"
            >
              <ChevronDown className="w-4 h-4" />
            </Button>

            <CardTitle className="text-base flex items-center gap-2">
              <Terminal className="w-4 h-4" />
              Live Logs
              {isStreaming && (
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              )}
            </CardTitle>

            <Badge variant="outline" className="text-xs">
              {filteredLogs.length} entries
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            {/* Log Level Filter */}
            <div className="flex items-center gap-1">
              <Filter className="w-3 h-3 text-muted-foreground" />
              <select
                value={selectedLevel}
                onChange={(e) => setSelectedLevel(e.target.value)}
                className="text-xs border border-input rounded px-2 py-1 bg-background"
              >
                {logLevels.map(level => (
                  <option key={level.id} value={level.id}>
                    {level.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Control Buttons */}
            <Button
              size="sm"
              variant={isPaused ? "default" : "outline"}
              onClick={handleTogglePause}
              title={isPaused ? "Resume streaming" : "Pause streaming"}
            >
              {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            </Button>

            <Button
              size="sm"
              variant={copied ? "default" : "outline"}
              onClick={handleCopy}
              title="Copy logs to clipboard"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={onDownload}
              title="Download logs as file"
            >
              <Download className="w-3 h-3" />
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={onClear}
              title="Clear all logs"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div
          ref={logContainerRef}
          onScroll={handleScroll}
          className="h-64 overflow-y-auto bg-slate-950 text-slate-100 font-mono text-xs"
        >
          {filteredLogs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-400">
              <div className="text-center">
                <Terminal className="mx-auto h-8 w-8 mb-2 opacity-50" />
                <p>No logs to display</p>
                <p className="text-xs mt-1">
                  {selectedLevel !== 'all' ? `No ${selectedLevel} logs found` : 'Waiting for logs...'}
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3 space-y-0.5">
              {filteredLogs.map((log, index) => {
                // Parse structured log message if it has multiple lines
                const lines = log.message.split('\n')
                const isMultiLine = lines.length > 1

                return (
                  <div
                    key={index}
                    className={cn(
                      'group flex items-start gap-2 py-1.5 hover:bg-slate-800/50 rounded px-2 -mx-2 transition-colors',
                      isMultiLine && 'flex-col'
                    )}
                  >
                    <div className={cn('flex items-center gap-2', isMultiLine ? 'w-full' : 'flex-1')}>
                      <span className="text-slate-500 text-[10px] flex-shrink-0 font-medium tabular-nums">
                        {formatTimestamp(log.timestamp)}
                      </span>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        {getLogIcon(log.level)}
                      </div>

                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] h-4 px-1.5 flex-shrink-0 uppercase font-semibold border-0',
                          log.level === 'error' && 'bg-red-500/10 text-red-400',
                          log.level === 'warn' && 'bg-yellow-500/10 text-yellow-400',
                          log.level === 'info' && 'bg-blue-500/10 text-blue-400',
                          log.level === 'success' && 'bg-green-500/10 text-green-400',
                          log.level === 'debug' && 'bg-gray-500/10 text-gray-400'
                        )}
                      >
                        {log.level}
                      </Badge>

                      {log.source && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5 flex-shrink-0">
                          {log.source}
                        </Badge>
                      )}

                      {!isMultiLine && (
                        <span className="flex-1 text-slate-200 leading-relaxed">
                          {log.message}
                        </span>
                      )}
                    </div>

                    {isMultiLine && (
                      <div className="w-full pl-24 space-y-0.5">
                        {lines.map((line, lineIdx) => (
                          <div key={lineIdx} className="text-slate-200 leading-relaxed">
                            {line}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Auto-scroll indicator */}
        {!autoScroll && (
          <div className="bg-yellow-500/10 border-t border-yellow-500/20 p-2 text-center">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setAutoScroll(true)
                if (logContainerRef.current) {
                  logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
                }
              }}
              className="text-xs text-yellow-600 dark:text-yellow-400"
            >
              <ChevronDown className="w-3 h-3 mr-1" />
              Scroll to bottom to resume auto-scroll
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default LiveLogPanel