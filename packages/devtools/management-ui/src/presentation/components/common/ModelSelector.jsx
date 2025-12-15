import React from 'react'
import { Cpu, ChevronDown, CheckCircle } from 'lucide-react'
import { Button } from '../ui/button'
import { cn } from '../../../lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { useAISettings, getModelDisplayName } from '../../hooks/useAISettings'

/**
 * ModelSelector - A shared dropdown component for selecting AI models
 *
 * @param {Object} props
 * @param {boolean} props.disabled - Whether the selector is disabled
 * @param {boolean} props.compact - Show compact version (icon only on mobile)
 * @param {string} props.className - Additional CSS classes
 */
const ModelSelector = ({ disabled = false, compact = true, className }) => {
  const { aiConfig, setModel, models } = useAISettings()
  const currentModel = aiConfig?.model

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn('h-10 px-3 gap-1.5', className)}
          disabled={disabled}
          title={`Current model: ${getModelDisplayName(currentModel, aiConfig?.provider)}`}
        >
          <Cpu className="w-4 h-4" />
          {compact ? (
            <span className="hidden sm:inline text-xs max-w-[100px] truncate">
              {getModelDisplayName(currentModel, aiConfig?.provider)}
            </span>
          ) : (
            <span className="text-xs">
              {getModelDisplayName(currentModel, aiConfig?.provider)}
            </span>
          )}
          <ChevronDown className="w-3 h-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Select Model</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {models.map((model) => (
          <DropdownMenuItem
            key={model.id}
            onClick={() => setModel(model.id)}
            className={cn(
              'flex flex-col items-start gap-0.5 cursor-pointer',
              currentModel === model.id && 'bg-accent'
            )}
          >
            <div className="flex items-center gap-2 w-full">
              <span className="font-medium">{model.name}</span>
              {model.recommended && (
                <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded">
                  Recommended
                </span>
              )}
              {currentModel === model.id && (
                <CheckCircle className="w-3.5 h-3.5 text-primary ml-auto" />
              )}
            </div>
            <span className="text-xs text-muted-foreground">{model.description}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default ModelSelector
