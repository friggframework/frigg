/**
 * Custom Tool UI Components for assistant-ui
 *
 * Provides specialized rendering for different Claude Code tools:
 * - Read: File viewer with syntax highlighting
 * - Write: File creation with content preview
 * - Edit: Diff viewer showing old vs new content
 * - Bash: Terminal-style command output
 * - Glob/Grep: Search results display
 *
 * Uses makeAssistantToolUI to register custom components.
 */

import React, { useState } from 'react'
import { makeAssistantToolUI } from '@assistant-ui/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '../../../lib/utils'
import {
  Eye,
  Edit,
  FileCode,
  Terminal,
  Search,
  Folder,
  Check,
  X,
  Loader2,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  FilePlus,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import { Button } from '../ui/button'

// Helper to extract filename from path
const getFileName = (path) => {
  if (!path) return 'unknown'
  const parts = path.split('/')
  return parts[parts.length - 1]
}

// Helper to get file extension
const getFileExtension = (path) => {
  if (!path) return ''
  const parts = path.split('.')
  return parts.length > 1 ? parts[parts.length - 1] : ''
}

// Helper to format file path for display
const formatPath = (path, maxLength = 50) => {
  if (!path) return ''
  if (path.length <= maxLength) return path
  const parts = path.split('/')
  if (parts.length <= 3) return path
  return `.../${parts.slice(-3).join('/')}`
}

// Copy to clipboard helper
const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * Status indicator component
 */
const StatusIndicator = ({ status }) => {
  if (status === 'running' || status === 'requires-action') {
    return <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
  }
  if (status === 'complete') {
    return <CheckCircle2 className="w-4 h-4 text-green-500" />
  }
  if (status === 'incomplete') {
    return <AlertCircle className="w-4 h-4 text-yellow-500" />
  }
  return null
}

/**
 * Collapsible section component
 */
const CollapsibleSection = ({ title, children, defaultOpen = false, className }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className={cn('border border-border/50 rounded-lg overflow-hidden', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        <span className="text-sm font-medium">{title}</span>
      </button>
      {isOpen && <div className="p-3 border-t border-border/50">{children}</div>}
    </div>
  )
}

/**
 * Code block with syntax highlighting (basic)
 */
const CodeBlock = ({ content, language, maxHeight = '300px', showLineNumbers = true }) => {
  const [copied, setCopied] = useState(false)
  const lines = content?.split('\n') || []

  const handleCopy = async () => {
    const success = await copyToClipboard(content)
    if (success) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="relative group">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded bg-background/80 border border-border/50 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Copy to clipboard"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-green-500" />
        ) : (
          <Copy className="w-3.5 h-3.5 text-muted-foreground" />
        )}
      </button>
      <pre
        className="text-xs font-mono bg-muted/50 rounded-lg p-3 overflow-auto"
        style={{ maxHeight }}
      >
        {showLineNumbers ? (
          <code>
            {lines.map((line, i) => (
              <div key={i} className="flex">
                <span className="text-muted-foreground/50 select-none w-8 text-right pr-3">
                  {i + 1}
                </span>
                <span className="flex-1">{line}</span>
              </div>
            ))}
          </code>
        ) : (
          <code>{content}</code>
        )}
      </pre>
    </div>
  )
}

/**
 * Simple diff viewer component
 */
const DiffViewer = ({ oldContent, newContent, filePath }) => {
  const [view, setView] = useState('split') // 'split' | 'unified' | 'new'

  return (
    <div className="space-y-2">
      {/* View toggle */}
      <div className="flex gap-1">
        <Button
          variant={view === 'split' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setView('split')}
          className="h-7 text-xs"
        >
          Split
        </Button>
        <Button
          variant={view === 'unified' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setView('unified')}
          className="h-7 text-xs"
        >
          Unified
        </Button>
        <Button
          variant={view === 'new' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setView('new')}
          className="h-7 text-xs"
        >
          New Only
        </Button>
      </div>

      {view === 'split' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-xs text-red-500/70 mb-1 font-medium">- Old</div>
            <CodeBlock content={oldContent || '(empty)'} maxHeight="200px" />
          </div>
          <div>
            <div className="text-xs text-green-500/70 mb-1 font-medium">+ New</div>
            <CodeBlock content={newContent || '(empty)'} maxHeight="200px" />
          </div>
        </div>
      )}

      {view === 'unified' && (
        <div className="space-y-1">
          {oldContent && (
            <div className="bg-red-500/10 border-l-2 border-red-500 pl-2 py-1">
              <pre className="text-xs font-mono text-red-600 dark:text-red-400 whitespace-pre-wrap">
                {oldContent.split('\n').map((line, i) => (
                  <div key={i}>- {line}</div>
                ))}
              </pre>
            </div>
          )}
          {newContent && (
            <div className="bg-green-500/10 border-l-2 border-green-500 pl-2 py-1">
              <pre className="text-xs font-mono text-green-600 dark:text-green-400 whitespace-pre-wrap">
                {newContent.split('\n').map((line, i) => (
                  <div key={i}>+ {line}</div>
                ))}
              </pre>
            </div>
          )}
        </div>
      )}

      {view === 'new' && <CodeBlock content={newContent || '(no content)'} maxHeight="300px" />}
    </div>
  )
}

/**
 * File link component - clickable file path
 */
const FileLink = ({ path, className }) => {
  const fileName = getFileName(path)
  const displayPath = formatPath(path)

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-mono text-xs text-blue-500 hover:text-blue-600 hover:underline cursor-pointer',
        className
      )}
      title={path}
      onClick={() => {
        // TODO: Emit event to open file in IDE
        console.log('Open file:', path)
      }}
    >
      <FileText className="w-3.5 h-3.5" />
      {displayPath}
    </span>
  )
}

// ============================================================================
// Custom Tool UIs using makeAssistantToolUI
// ============================================================================

/**
 * Read Tool UI - File reading with content preview
 */
export const ReadToolUI = makeAssistantToolUI({
  toolName: 'Read',
  render: ({ args, result, status }) => {
    const filePath = args?.file_path || args?.path
    const isRunning = status?.type === 'running'
    const isComplete = status?.type === 'complete'

    return (
      <div className="my-2 rounded-lg border border-border/50 overflow-hidden bg-muted/30">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border/50">
          <Eye className="w-4 h-4 text-blue-500" />
          <span className="font-medium text-sm">Read File</span>
          <StatusIndicator status={status?.type} />
        </div>

        {/* File path */}
        <div className="px-3 py-2">
          <FileLink path={filePath} />
        </div>

        {/* Content preview */}
        {isComplete && result && (
          <CollapsibleSection title="File Content" className="m-2 mt-0">
            <CodeBlock
              content={typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
              maxHeight="250px"
            />
          </CollapsibleSection>
        )}
      </div>
    )
  },
})

/**
 * Write Tool UI - File creation/overwrite
 */
export const WriteToolUI = makeAssistantToolUI({
  toolName: 'Write',
  render: ({ args, result, status }) => {
    const filePath = args?.file_path || args?.path
    const content = args?.content
    const isRunning = status?.type === 'running'
    const isComplete = status?.type === 'complete'

    return (
      <div className="my-2 rounded-lg border border-green-500/30 overflow-hidden bg-green-500/5">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border-b border-green-500/20">
          <FilePlus className="w-4 h-4 text-green-500" />
          <span className="font-medium text-sm">Create File</span>
          <StatusIndicator status={status?.type} />
        </div>

        {/* File path */}
        <div className="px-3 py-2">
          <FileLink path={filePath} />
          {content && (
            <span className="ml-2 text-xs text-muted-foreground">
              ({content.length.toLocaleString()} chars)
            </span>
          )}
        </div>

        {/* Content preview */}
        {content && (
          <CollapsibleSection title="File Content" className="m-2 mt-0">
            <CodeBlock content={content} maxHeight="250px" />
          </CollapsibleSection>
        )}
      </div>
    )
  },
})

/**
 * Edit Tool UI - File editing with diff display
 */
export const EditToolUI = makeAssistantToolUI({
  toolName: 'Edit',
  render: ({ args, result, status }) => {
    const filePath = args?.file_path || args?.path
    const oldString = args?.old_string
    const newString = args?.new_string
    const isRunning = status?.type === 'running'
    const isComplete = status?.type === 'complete'

    return (
      <div className="my-2 rounded-lg border border-yellow-500/30 overflow-hidden bg-yellow-500/5">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 bg-yellow-500/10 border-b border-yellow-500/20">
          <Edit className="w-4 h-4 text-yellow-500" />
          <span className="font-medium text-sm">Edit File</span>
          <StatusIndicator status={status?.type} />
        </div>

        {/* File path */}
        <div className="px-3 py-2">
          <FileLink path={filePath} />
        </div>

        {/* Diff view */}
        {(oldString || newString) && (
          <div className="px-3 pb-3">
            <DiffViewer oldContent={oldString} newContent={newString} filePath={filePath} />
          </div>
        )}
      </div>
    )
  },
})

/**
 * Bash Tool UI - Terminal command execution
 */
export const BashToolUI = makeAssistantToolUI({
  toolName: 'Bash',
  render: ({ args, result, status }) => {
    const command = args?.command
    const isRunning = status?.type === 'running'
    const isComplete = status?.type === 'complete'

    return (
      <div className="my-2 rounded-lg border border-border/50 overflow-hidden bg-zinc-900">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800 border-b border-zinc-700">
          <Terminal className="w-4 h-4 text-green-400" />
          <span className="font-medium text-sm text-zinc-200">Terminal</span>
          <StatusIndicator status={status?.type} />
        </div>

        {/* Command */}
        {command && (
          <div className="px-3 py-2 border-b border-zinc-800">
            <pre className="text-xs font-mono text-green-400">
              <span className="text-zinc-500">$</span> {command}
            </pre>
          </div>
        )}

        {/* Output */}
        {isComplete && result && (
          <div className="px-3 py-2 max-h-48 overflow-auto">
            <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap">
              {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}

        {isRunning && (
          <div className="px-3 py-2">
            <span className="text-xs text-zinc-500 animate-pulse">Running...</span>
          </div>
        )}
      </div>
    )
  },
})

/**
 * Glob Tool UI - File pattern search
 */
export const GlobToolUI = makeAssistantToolUI({
  toolName: 'Glob',
  render: ({ args, result, status }) => {
    const pattern = args?.pattern
    const isComplete = status?.type === 'complete'

    // Parse result to get file list
    let files = []
    if (result) {
      if (Array.isArray(result)) {
        files = result
      } else if (typeof result === 'string') {
        files = result.split('\n').filter(Boolean)
      }
    }

    return (
      <div className="my-2 rounded-lg border border-border/50 overflow-hidden bg-muted/30">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border/50">
          <Folder className="w-4 h-4 text-orange-500" />
          <span className="font-medium text-sm">Find Files</span>
          <StatusIndicator status={status?.type} />
        </div>

        {/* Pattern */}
        {pattern && (
          <div className="px-3 py-2 border-b border-border/30">
            <code className="text-xs font-mono bg-muted px-2 py-1 rounded">{pattern}</code>
          </div>
        )}

        {/* Results */}
        {isComplete && files.length > 0 && (
          <div className="px-3 py-2">
            <div className="text-xs text-muted-foreground mb-2">
              Found {files.length} file{files.length !== 1 ? 's' : ''}
            </div>
            <div className="max-h-40 overflow-auto space-y-1">
              {files.slice(0, 20).map((file, i) => (
                <FileLink key={i} path={file} className="block" />
              ))}
              {files.length > 20 && (
                <div className="text-xs text-muted-foreground">
                  ... and {files.length - 20} more
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  },
})

/**
 * Grep Tool UI - Content search
 */
export const GrepToolUI = makeAssistantToolUI({
  toolName: 'Grep',
  render: ({ args, result, status }) => {
    const pattern = args?.pattern
    const path = args?.path
    const isComplete = status?.type === 'complete'

    return (
      <div className="my-2 rounded-lg border border-border/50 overflow-hidden bg-muted/30">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border/50">
          <Search className="w-4 h-4 text-purple-500" />
          <span className="font-medium text-sm">Search Content</span>
          <StatusIndicator status={status?.type} />
        </div>

        {/* Search info */}
        <div className="px-3 py-2 border-b border-border/30 space-y-1">
          {pattern && (
            <div className="text-xs">
              <span className="text-muted-foreground">Pattern: </span>
              <code className="font-mono bg-muted px-1.5 py-0.5 rounded">{pattern}</code>
            </div>
          )}
          {path && (
            <div className="text-xs">
              <span className="text-muted-foreground">In: </span>
              <code className="font-mono">{formatPath(path)}</code>
            </div>
          )}
        </div>

        {/* Results */}
        {isComplete && result && (
          <CollapsibleSection title="Search Results" className="m-2 mt-0" defaultOpen>
            <pre className="text-xs font-mono whitespace-pre-wrap max-h-48 overflow-auto">
              {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
            </pre>
          </CollapsibleSection>
        )}
      </div>
    )
  },
})

/**
 * TodoWrite Tool UI - Task list display
 */
export const TodoWriteToolUI = makeAssistantToolUI({
  toolName: 'TodoWrite',
  render: ({ args, result, status }) => {
    const todos = args?.todos || []
    const isComplete = status?.type === 'complete'

    const getStatusIcon = (todoStatus) => {
      switch (todoStatus) {
        case 'completed':
          return <Check className="w-3.5 h-3.5 text-green-500" />
        case 'in_progress':
          return <Loader2 className="w-3.5 h-3.5 text-purple-500 animate-spin" />
        default:
          return <div className="w-3.5 h-3.5 rounded-full border-2 border-muted-foreground/30" />
      }
    }

    return (
      <div className="my-2 rounded-lg border border-border/50 overflow-hidden bg-muted/30">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border/50">
          <FileText className="w-4 h-4 text-blue-500" />
          <span className="font-medium text-sm">Task List</span>
          <StatusIndicator status={status?.type} />
        </div>

        {/* Todos */}
        {todos.length > 0 && (
          <div className="p-2 space-y-1">
            {todos.map((todo, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center gap-2 px-2 py-1.5 rounded text-sm',
                  todo.status === 'completed' && 'text-muted-foreground line-through',
                  todo.status === 'in_progress' && 'bg-purple-500/10'
                )}
              >
                {getStatusIcon(todo.status)}
                <span>{todo.content}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  },
})

/**
 * Component to register all tool UIs
 * Include this in your component tree inside AssistantRuntimeProvider
 */
export function FriggToolUIs() {
  return (
    <>
      <ReadToolUI />
      <WriteToolUI />
      <EditToolUI />
      <BashToolUI />
      <GlobToolUI />
      <GrepToolUI />
      <TodoWriteToolUI />
    </>
  )
}

export default FriggToolUIs
