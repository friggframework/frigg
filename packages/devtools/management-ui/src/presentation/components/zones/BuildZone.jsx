import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Bot, Send, StopCircle, CheckCircle, XCircle, FileCode, GitBranch, Play, RotateCcw, AlertTriangle } from 'lucide-react'
import { Button } from '../ui/button'
import { cn } from '../../../lib/utils'
import { useSocket } from '../../hooks/useSocket'
import { useAISettings } from '../../hooks/useAISettings'

const BuildZone = ({ className }) => {
  const { socket, connected } = useSocket()
  const { aiConfig } = useAISettings()
  const [prompt, setPrompt] = useState('')
  const [messages, setMessages] = useState([])
  const [isRunning, setIsRunning] = useState(false)
  const [currentProposal, setCurrentProposal] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const messagesEndRef = useRef(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  useEffect(() => {
    if (!socket) return

    const handleAgentEvent = (event) => {
      if (event.sessionId !== sessionId) return

      switch (event.type) {
        case 'content':
          setMessages(prev => {
            const last = prev[prev.length - 1]
            if (last?.type === 'assistant' && !last.complete) {
              return [...prev.slice(0, -1), { ...last, content: last.content + event.content }]
            }
            return [...prev, { type: 'assistant', content: event.content, complete: false }]
          })
          break
        case 'tool_call':
          setMessages(prev => [...prev, { type: 'tool', name: event.name, args: event.args, status: 'running' }])
          break
        case 'tool_result':
          setMessages(prev => {
            const idx = prev.findLastIndex(m => m.type === 'tool' && m.name === event.name && m.status === 'running')
            if (idx >= 0) {
              const updated = [...prev]
              updated[idx] = { ...updated[idx], result: event.result, status: 'complete' }
              return updated
            }
            return prev
          })
          break
        case 'done':
          setIsRunning(false)
          setMessages(prev => {
            const last = prev[prev.length - 1]
            if (last?.type === 'assistant') {
              return [...prev.slice(0, -1), { ...last, complete: true }]
            }
            return prev
          })
          break
        case 'error':
          setIsRunning(false)
          setMessages(prev => [...prev, { type: 'error', content: event.error?.message || 'An error occurred' }])
          break
      }
    }

    const handleProposal = (data) => {
      if (data.sessionId !== sessionId) return
      setCurrentProposal(data.proposal)
      setIsRunning(false)
    }

    socket.on('agent:event', handleAgentEvent)
    socket.on('agent:proposal', handleProposal)

    return () => {
      socket.off('agent:event', handleAgentEvent)
      socket.off('agent:proposal', handleProposal)
    }
  }, [socket, sessionId])

  const handleSubmit = useCallback((e) => {
    e.preventDefault()
    if (!prompt.trim() || isRunning || !aiConfig?.apiKey) return

    const newSessionId = `session-${Date.now()}`
    setSessionId(newSessionId)
    setMessages(prev => [...prev, { type: 'user', content: prompt }])
    setPrompt('')
    setIsRunning(true)
    setCurrentProposal(null)

    socket?.emit('agent:start', {
      sessionId: newSessionId,
      prompt,
      config: {
        provider: aiConfig.provider,
        model: aiConfig.model,
        requireApproval: aiConfig.requireApproval,
        confidenceThreshold: aiConfig.confidenceThreshold
      }
    })
  }, [prompt, isRunning, aiConfig, socket])

  const handleStop = useCallback(() => {
    socket?.emit('agent:stop', { sessionId })
    setIsRunning(false)
  }, [socket, sessionId])

  const handleApprove = useCallback(() => {
    socket?.emit('agent:approve', { sessionId, proposalId: currentProposal?.id })
    setCurrentProposal(null)
    setMessages(prev => [...prev, { type: 'system', content: 'Changes approved and applied.' }])
  }, [socket, sessionId, currentProposal])

  const handleReject = useCallback(() => {
    socket?.emit('agent:reject', { sessionId, proposalId: currentProposal?.id })
    setCurrentProposal(null)
    setMessages(prev => [...prev, { type: 'system', content: 'Changes rejected.' }])
  }, [socket, sessionId, currentProposal])

  const handleRollback = useCallback(() => {
    socket?.emit('agent:rollback', { sessionId, proposalId: currentProposal?.id })
    setCurrentProposal(null)
    setMessages(prev => [...prev, { type: 'system', content: 'Rolling back changes...' }])
  }, [socket, sessionId, currentProposal])

  if (!aiConfig?.apiKey) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full p-8', className)}>
        <div className="max-w-md text-center space-y-4">
          <div className="w-16 h-16 mx-auto bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
            <Bot className="w-8 h-8 text-purple-500" />
          </div>
          <h2 className="text-xl font-semibold text-foreground">Configure AI Settings</h2>
          <p className="text-muted-foreground">
            To use the Build Zone, please configure your AI provider and API key in Settings → AI Agents.
          </p>
          <Button variant="outline">
            Open Settings
          </Button>
        </div>
      </div>
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
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={cn(
            'w-2 h-2 rounded-full',
            connected ? 'bg-green-500' : 'bg-red-500'
          )} />
          {connected ? 'Connected' : 'Disconnected'}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground py-12">
            <p className="text-lg font-medium mb-2">Start Building</p>
            <p className="text-sm max-w-md mx-auto">
              Describe what integration you want to build, and the AI agent will generate the code following Frigg patterns.
            </p>
            <div className="mt-6 space-y-2 text-sm text-left max-w-md mx-auto">
              <p className="font-medium text-foreground">Try asking:</p>
              <ul className="space-y-1 text-muted-foreground">
                <li>• "Create a HubSpot CRM integration with OAuth2"</li>
                <li>• "Add webhook handling to the Slack integration"</li>
                <li>• "Generate a Stripe payment integration"</li>
              </ul>
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={cn(
            'flex gap-3',
            msg.type === 'user' && 'flex-row-reverse'
          )}>
            {msg.type === 'user' && (
              <div className="w-8 h-8 bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-medium text-primary">You</span>
              </div>
            )}
            {msg.type === 'assistant' && (
              <div className="w-8 h-8 bg-purple-500/10 border border-purple-500/20 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-purple-500" />
              </div>
            )}
            {msg.type === 'tool' && (
              <div className="w-8 h-8 bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                <Play className="w-4 h-4 text-blue-500" />
              </div>
            )}
            {msg.type === 'error' && (
              <div className="w-8 h-8 bg-destructive/10 border border-destructive/20 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4 h-4 text-destructive" />
              </div>
            )}
            {msg.type === 'system' && (
              <div className="w-8 h-8 bg-muted border border-border flex items-center justify-center flex-shrink-0">
                <GitBranch className="w-4 h-4 text-muted-foreground" />
              </div>
            )}

            <div className={cn(
              'flex-1 max-w-[80%] rounded-lg p-3',
              msg.type === 'user' && 'bg-primary text-primary-foreground',
              msg.type === 'assistant' && 'bg-muted',
              msg.type === 'tool' && 'bg-blue-500/10 border border-blue-500/20',
              msg.type === 'error' && 'bg-destructive/10 border border-destructive/20 text-destructive',
              msg.type === 'system' && 'bg-muted/50 border border-border text-muted-foreground'
            )}>
              {msg.type === 'tool' ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className="text-blue-600">{msg.name}</span>
                    {msg.status === 'running' && (
                      <span className="text-xs text-muted-foreground animate-pulse">Running...</span>
                    )}
                    {msg.status === 'complete' && (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    )}
                  </div>
                  {msg.result && (
                    <pre className="text-xs bg-background/50 p-2 rounded overflow-x-auto">
                      {JSON.stringify(msg.result, null, 2)}
                    </pre>
                  )}
                </div>
              ) : (
                <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
              )}
            </div>
          </div>
        ))}

        {isRunning && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
            Agent is thinking...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Proposal Review */}
      {currentProposal && (
        <div className="border-t border-border p-4 bg-muted/30">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
              <FileCode className="w-4 h-4 text-amber-500" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-foreground">Review Proposed Changes</h3>
              <p className="text-sm text-muted-foreground">
                {currentProposal.files?.length || 0} files • Confidence: {currentProposal.confidence}%
              </p>
            </div>
          </div>

          <div className="space-y-2 mb-4 max-h-40 overflow-y-auto">
            {currentProposal.files?.map((file, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm p-2 bg-background rounded border">
                <FileCode className="w-4 h-4 text-muted-foreground" />
                <span className="font-mono text-xs flex-1 truncate">{file.path}</span>
                <span className={cn(
                  'text-xs px-2 py-0.5 rounded',
                  file.action === 'create' && 'bg-green-500/10 text-green-600',
                  file.action === 'modify' && 'bg-blue-500/10 text-blue-600',
                  file.action === 'delete' && 'bg-red-500/10 text-red-600'
                )}>
                  {file.action}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={handleApprove} className="flex-1">
              <CheckCircle className="w-4 h-4 mr-2" />
              Approve & Apply
            </Button>
            <Button variant="outline" onClick={handleReject}>
              <XCircle className="w-4 h-4 mr-2" />
              Reject
            </Button>
            {currentProposal.checkpointId && (
              <Button variant="ghost" onClick={handleRollback}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Rollback
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="border-t border-border p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe what integration to build..."
            className="flex-1 px-4 py-2 border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={isRunning}
          />
          {isRunning ? (
            <Button type="button" variant="destructive" onClick={handleStop}>
              <StopCircle className="w-4 h-4 mr-2" />
              Stop
            </Button>
          ) : (
            <Button type="submit" disabled={!prompt.trim()}>
              <Send className="w-4 h-4 mr-2" />
              Send
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}

export default BuildZone
