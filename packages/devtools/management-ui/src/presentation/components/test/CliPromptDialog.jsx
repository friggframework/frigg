import React from 'react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import {
  AlertTriangle,
  Check,
  X,
  HelpCircle,
  Play,
  Server
} from 'lucide-react'

/**
 * CliPromptDialog Component
 *
 * Displays interactive prompts from the Frigg CLI during startup.
 * Used for pre-flight checks that require user input (e.g., starting Docker).
 *
 * @param {Object} props
 * @param {Object} props.prompt - The prompt data from CLI
 * @param {string} props.prompt.requestId - Unique ID for this prompt
 * @param {Object} props.prompt.prompt - The prompt details
 * @param {string} props.prompt.prompt.type - 'confirm' | 'select' | 'input'
 * @param {string} props.prompt.prompt.message - The prompt message
 * @param {boolean} props.prompt.prompt.default - Default value for confirm prompts
 * @param {Array} props.prompt.prompt.choices - Options for select prompts
 * @param {Function} props.onRespond - Callback when user responds (requestId, response)
 */
const CliPromptDialog = ({ prompt, onRespond }) => {
  if (!prompt) return null

  const { requestId, prompt: promptData } = prompt
  const { type, message, default: defaultValue, choices } = promptData

  const handleConfirm = (value) => {
    onRespond(requestId, value)
  }

  const handleSelect = (value) => {
    onRespond(requestId, value)
  }

  // Determine icon based on message content
  const getIcon = () => {
    const lowerMessage = message.toLowerCase()
    if (lowerMessage.includes('docker')) {
      return <Server className="w-6 h-6 text-blue-500" />
    }
    if (lowerMessage.includes('database')) {
      return <Server className="w-6 h-6 text-purple-500" />
    }
    return <HelpCircle className="w-6 h-6 text-yellow-500" />
  }

  // Determine the action context for the message
  const getContextBadge = () => {
    const lowerMessage = message.toLowerCase()
    if (lowerMessage.includes('docker desktop')) {
      return (
        <Badge variant="outline" className="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
          Docker Desktop
        </Badge>
      )
    }
    if (lowerMessage.includes('docker compose') || lowerMessage.includes('docker-compose')) {
      return (
        <Badge variant="outline" className="bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
          Docker Compose
        </Badge>
      )
    }
    if (lowerMessage.includes('database')) {
      return (
        <Badge variant="outline" className="bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300">
          Database
        </Badge>
      )
    }
    return (
      <Badge variant="outline" className="bg-yellow-50 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300">
        Pre-flight Check
      </Badge>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card border border-border rounded-lg shadow-2xl max-w-md w-full mx-4 animate-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30">
            <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-lg">Action Required</h3>
            <div className="flex items-center gap-2 mt-1">
              {getContextBadge()}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <div className="flex items-start gap-3">
            {getIcon()}
            <p className="text-foreground leading-relaxed">{message}</p>
          </div>

          {/* Render based on prompt type */}
          {type === 'confirm' && (
            <div className="flex items-center gap-3 pt-2">
              <Button
                onClick={() => handleConfirm(true)}
                className="flex-1 gap-2"
                variant={defaultValue === true ? 'default' : 'outline'}
              >
                <Check className="w-4 h-4" />
                Yes
              </Button>
              <Button
                onClick={() => handleConfirm(false)}
                className="flex-1 gap-2"
                variant={defaultValue === false ? 'default' : 'outline'}
              >
                <X className="w-4 h-4" />
                No
              </Button>
            </div>
          )}

          {type === 'select' && choices && (
            <div className="space-y-2 pt-2">
              {choices.map((choice) => (
                <Button
                  key={choice.value}
                  onClick={() => handleSelect(choice.value)}
                  variant="outline"
                  className="w-full justify-start gap-2"
                >
                  <Play className="w-4 h-4" />
                  {choice.name}
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 pb-4">
          <p className="text-xs text-muted-foreground text-center">
            This prompt is from Frigg CLI pre-flight checks
          </p>
        </div>
      </div>
    </div>
  )
}

export default CliPromptDialog
