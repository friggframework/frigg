/**
 * AssistantThread - Chat UI using assistant-ui primitives
 *
 * Provides streaming messages, tool call display, markdown rendering,
 * and auto-scrolling.
 */

import React from 'react'
import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
} from '@assistant-ui/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '../../../lib/utils'
import { Bot, User, Send, ArrowDown, Terminal, FileCode, Eye, Edit, Search, Loader2, Check, X, ChevronDown, ChevronRight, Shield, ShieldCheck, ShieldX } from 'lucide-react'
import { Button } from '../ui/button'
import { PermissionPrompt } from './PermissionPrompt'
import { usePermissions } from './FriggRuntimeProvider'

// Tool icons mapping
const TOOL_ICONS = {
  Read: Eye,
  Write: Edit,
  Edit: Edit,
  Glob: Search,
  Grep: Search,
  Bash: Terminal,
  default: FileCode,
}

/**
 * Custom Text component that renders markdown using react-markdown
 * Ensures proper paragraph spacing and formatting
 */
const MarkdownText = ({ text }) => {
  // Pre-process text to ensure markdown formatting works
  // Sometimes text comes with single newlines that should be paragraphs
  const processedText = text
    // Convert sentences ending with period followed by newline + capital letter to paragraph break
    ?.replace(/\.\n([A-Z])/g, '.\n\n$1')
    // Ensure bullet points have proper spacing
    ?.replace(/\n-\s/g, '\n\n- ')
    // Ensure headers have proper spacing
    ?.replace(/\n(#{1,6}\s)/g, '\n\n$1')
    || ''

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none
      prose-p:my-3 prose-p:leading-relaxed
      prose-headings:mt-6 prose-headings:mb-3 prose-headings:font-semibold
      prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
      prose-ul:my-3 prose-ol:my-3 prose-li:my-1
      prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono
      prose-pre:bg-zinc-900 prose-pre:p-4 prose-pre:rounded-lg prose-pre:overflow-x-auto
      prose-strong:font-semibold prose-strong:text-foreground
      prose-blockquote:border-l-4 prose-blockquote:border-purple-500/50 prose-blockquote:pl-4 prose-blockquote:italic
      [&>*:first-child]:mt-0 [&>*:last-child]:mb-0
    ">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {processedText}
      </ReactMarkdown>
    </div>
  )
}

/**
 * Inline permission action display - shows user approval/denial
 */
const InlinePermissionAction = ({ action }) => {
  const isApproved = action.type === 'approved'

  return (
    <div className={cn(
      'flex items-center gap-2 py-1.5 px-3 my-1 rounded-md text-xs',
      isApproved
        ? 'bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400'
        : 'bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400'
    )}>
      <User className="w-3.5 h-3.5 flex-shrink-0" />
      {isApproved ? (
        <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
      ) : (
        <ShieldX className="w-3.5 h-3.5 flex-shrink-0" />
      )}
      <span className="font-medium">
        {isApproved ? 'Approved' : 'Denied'}
      </span>
      <span className="text-muted-foreground">•</span>
      <span className="truncate">{action.description}</span>
      {action.reason && (
        <>
          <span className="text-muted-foreground">•</span>
          <span className="italic">{action.reason}</span>
        </>
      )}
    </div>
  )
}

/**
 * Tool call display component with expandable details
 * Includes inline permission action display when applicable
 */
const ToolCallComponent = ({ toolName, toolCallId, args, result, status }) => {
  const [expanded, setExpanded] = React.useState(false)
  const { getActionForTool } = usePermissions()
  const Icon = TOOL_ICONS[toolName] || TOOL_ICONS.default
  const isRunning = status === 'running' || status === 'requires-action'
  const hasDetails = args || result

  // Check if there's a permission action for this tool call
  const permissionAction = getActionForTool(toolCallId, toolName)

  const getDescription = () => {
    if (!args) return ''
    if (args.file_path || args.path) {
      const path = args.file_path || args.path
      // Show relative path or just filename
      const parts = path.split('/')
      return parts.length > 3 ? `.../${parts.slice(-3).join('/')}` : path
    }
    if (args.pattern) return `pattern: "${args.pattern}"`
    if (args.command) {
      const cmd = args.command.trim()
      return cmd.length > 50 ? cmd.slice(0, 50) + '...' : cmd
    }
    if (args.content) return `${args.content.length} chars`
    return ''
  }

  const description = getDescription()

  return (
    <div className="my-2">
      {/* Tool call display */}
      <div className={cn(
        'rounded-lg text-sm border overflow-hidden',
        isRunning ? 'bg-muted/80 border-purple-500/30' : 'bg-muted/50 border-border/50'
      )}>
        {/* Header - always visible */}
        <button
          onClick={() => hasDetails && setExpanded(!expanded)}
          className={cn(
            'w-full flex items-center gap-2 py-2 px-3 text-left',
            hasDetails && 'hover:bg-muted/80 cursor-pointer'
          )}
          disabled={!hasDetails}
        >
          {isRunning ? (
            <Loader2 className="w-4 h-4 animate-spin text-purple-500 flex-shrink-0" />
          ) : (
            <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          )}
          <span className="font-medium text-foreground">{toolName}</span>
          {description && (
            <>
              <span className="text-muted-foreground/50">•</span>
              <span className="font-mono text-xs text-muted-foreground truncate flex-1">
                {description}
              </span>
            </>
          )}
          {result !== undefined && !isRunning && (
            <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
          )}
          {hasDetails && (
            expanded ?
              <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" /> :
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          )}
        </button>

        {/* Expanded details */}
        {expanded && hasDetails && (
          <div className="border-t border-border/50 px-3 py-2 space-y-2 max-h-64 overflow-y-auto">
            {args && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Arguments:</div>
                <pre className="text-xs bg-background/50 p-2 rounded overflow-x-auto whitespace-pre-wrap break-all">
                  {JSON.stringify(args, null, 2)}
                </pre>
              </div>
            )}
            {result !== undefined && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Result:</div>
                <pre className="text-xs bg-background/50 p-2 rounded overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-all">
                  {typeof result === 'string' ? result.slice(0, 500) : JSON.stringify(result, null, 2)?.slice(0, 500)}
                  {(typeof result === 'string' ? result.length : JSON.stringify(result)?.length) > 500 && '...'}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Permission action display - shows inline after the tool call */}
      {permissionAction && (
        <InlinePermissionAction action={permissionAction} />
      )}
    </div>
  )
}

/**
 * Welcome message shown when thread is empty
 */
const WelcomeMessage = () => (
  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
    <div className="w-16 h-16 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4">
      <Bot className="w-8 h-8 text-purple-500" />
    </div>
    <h2 className="text-xl font-semibold mb-2">Start Building</h2>
    <p className="text-muted-foreground text-sm max-w-md mb-6">
      Describe what integration you want to build, and the AI agent will generate
      the code following Frigg patterns.
    </p>
    <div className="text-left text-sm space-y-1.5 text-muted-foreground">
      <p className="font-medium text-foreground mb-2">Try asking:</p>
      <p>• "Create a HubSpot CRM integration with OAuth2"</p>
      <p>• "Add webhook handling to the Slack integration"</p>
      <p>• "Generate a Stripe payment integration"</p>
    </div>
  </div>
)

/**
 * User message component
 */
const UserMessageComponent = () => (
  <MessagePrimitive.Root className="flex gap-3 justify-end px-4 py-2">
    <div className="max-w-[80%] bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-4 py-2.5">
      <MessagePrimitive.Parts
        components={{
          Text: ({ text }) => <p className="text-sm whitespace-pre-wrap">{text}</p>,
        }}
      />
    </div>
    <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
      <User className="w-4 h-4 text-primary" />
    </div>
  </MessagePrimitive.Root>
)

/**
 * Text component that shows streaming indicator when in progress
 */
const StreamingText = ({ text, isRunning }) => {
  // Use same processing as MarkdownText
  const processedText = text
    ?.replace(/\.\n([A-Z])/g, '.\n\n$1')
    ?.replace(/\n-\s/g, '\n\n- ')
    ?.replace(/\n(#{1,6}\s)/g, '\n\n$1')
    || ''

  return (
    <div>
      <div className="prose prose-sm dark:prose-invert max-w-none
        prose-p:my-3 prose-p:leading-relaxed
        prose-headings:mt-6 prose-headings:mb-3 prose-headings:font-semibold
        prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
        prose-ul:my-3 prose-ol:my-3 prose-li:my-1
        prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono
        prose-pre:bg-zinc-900 prose-pre:p-4 prose-pre:rounded-lg prose-pre:overflow-x-auto
        prose-strong:font-semibold prose-strong:text-foreground
        [&>*:first-child]:mt-0 [&>*:last-child]:mb-0
      ">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {processedText}
        </ReactMarkdown>
      </div>
      {isRunning && (
        <span className="inline-flex items-center gap-1.5 text-xs text-purple-500 mt-3">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Thinking...</span>
        </span>
      )}
    </div>
  )
}

/**
 * Assistant message component with markdown rendering
 */
const AssistantMessageComponent = () => (
  <MessagePrimitive.Root className="flex gap-3 px-4 py-2">
    <div className="w-8 h-8 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center flex-shrink-0">
      <Bot className="w-4 h-4 text-purple-500" />
    </div>
    <div className="flex-1 max-w-[85%]">
      <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
        <MessagePrimitive.If last>
          <ThreadPrimitive.If running>
            <MessagePrimitive.Parts
              components={{
                Text: ({ text }) => <StreamingText text={text} isRunning={true} />,
                tools: {
                  Fallback: ToolCallComponent,
                },
              }}
            />
          </ThreadPrimitive.If>
          <ThreadPrimitive.If running={false}>
            <MessagePrimitive.Parts
              components={{
                Text: MarkdownText,
                tools: {
                  Fallback: ToolCallComponent,
                },
              }}
            />
          </ThreadPrimitive.If>
        </MessagePrimitive.If>
        <MessagePrimitive.If last={false}>
          <MessagePrimitive.Parts
            components={{
              Text: MarkdownText,
              tools: {
                Fallback: ToolCallComponent,
              },
            }}
          />
        </MessagePrimitive.If>
      </div>
    </div>
  </MessagePrimitive.Root>
)

/**
 * Main thread component
 */
export function AssistantThread({ className }) {
  return (
    <ThreadPrimitive.Root className={cn('flex flex-col h-full', className)}>
      {/* Messages viewport */}
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto">
        <ThreadPrimitive.Empty>
          <WelcomeMessage />
        </ThreadPrimitive.Empty>

        <ThreadPrimitive.Messages
          components={{
            UserMessage: UserMessageComponent,
            AssistantMessage: AssistantMessageComponent,
          }}
        />

        {/* Scroll to bottom */}
        <ThreadPrimitive.ScrollToBottom asChild>
          <Button
            variant="outline"
            size="icon"
            className="absolute bottom-24 right-4 rounded-full shadow-md"
          >
            <ArrowDown className="w-4 h-4" />
          </Button>
        </ThreadPrimitive.ScrollToBottom>
      </ThreadPrimitive.Viewport>

      {/* Permission prompt */}
      <PermissionPrompt />

      {/* Input area */}
      <div className="border-t border-border p-4">
        <ComposerPrimitive.Root className="flex gap-2">
          <ComposerPrimitive.Input
            placeholder="Describe what integration to build..."
            className="flex-1 px-4 py-2.5 border border-input bg-background text-foreground rounded-lg focus:outline-none focus:ring-2 focus:ring-ring resize-none min-h-[44px] max-h-[200px]"
            autoFocus
          />
          <ComposerPrimitive.Send asChild>
            <Button className="px-4 py-2.5 h-auto">
              <Send className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Send</span>
            </Button>
          </ComposerPrimitive.Send>
        </ComposerPrimitive.Root>
      </div>
    </ThreadPrimitive.Root>
  )
}

export default AssistantThread
