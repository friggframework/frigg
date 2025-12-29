import React, { useState } from 'react'
import { ExternalLink, Code, Settings, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '../ui/button'
import { useIDE } from '../../hooks/useIDE'
import { useFrigg } from '../../hooks/useFrigg'
import { cn } from '../../../lib/utils'

const OpenInIDEButton = ({
  filePath,
  variant = "default",
  size = "default",
  className,
  showIDEName = true,
  disabled = false
}) => {
  const { preferredIDE, openInIDE } = useIDE()
  const { currentRepository } = useFrigg()
  const [isOpening, setIsOpening] = useState(false)
  const [status, setStatus] = useState(null) // 'success' | 'error' | null

  const handleOpenInIDE = async () => {
    if (!preferredIDE || !filePath) return

    setIsOpening(true)
    setStatus(null)

    try {
      // Pass project ID from current repository
      await openInIDE(filePath, currentRepository?.id)
      setStatus('success')

      // Clear success status after 2 seconds
      setTimeout(() => setStatus(null), 2000)
    } catch (error) {
      console.error('Failed to open in IDE:', error)
      setStatus('error')

      // Clear error status after 3 seconds
      setTimeout(() => setStatus(null), 3000)
    } finally {
      setIsOpening(false)
    }
  }

  // If no IDE is configured, show setup prompt
  if (!preferredIDE) {
    return (
      <Button
        variant="outline"
        size={size}
        disabled
        className={cn("gap-2", className)}
        title="Configure IDE in Settings first"
      >
        <Settings className="w-4 h-4" />
        <span>Configure IDE</span>
      </Button>
    )
  }

  // Status icons
  const StatusIcon = () => {
    if (status === 'success') {
      return <CheckCircle2 className="w-4 h-4 text-green-600" />
    }
    if (status === 'error') {
      return <AlertCircle className="w-4 h-4 text-red-600" />
    }
    if (isOpening) {
      return <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
    }
    return <ExternalLink className="w-4 h-4" />
  }

  // Button text based on state
  const getButtonText = () => {
    if (status === 'success') {
      return 'Opened!'
    }
    if (status === 'error') {
      return 'Failed'
    }
    if (isOpening) {
      return 'Opening...'
    }

    const baseText = 'Open in'
    if (showIDEName && preferredIDE.name) {
      // Truncate long IDE names
      const ideName = preferredIDE.name.length > 12
        ? preferredIDE.name.substring(0, 12) + '...'
        : preferredIDE.name
      return `${baseText} ${ideName}`
    }
    return `${baseText} IDE`
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleOpenInIDE}
      disabled={disabled || isOpening || !filePath}
      className={cn(
        "gap-2 transition-all duration-200",
        status === 'success' && "bg-green-600 hover:bg-green-700 text-white",
        status === 'error' && "bg-red-600 hover:bg-red-700 text-white",
        className
      )}
      title={filePath ? `Open ${filePath} in ${preferredIDE.name}` : 'No file path provided'}
    >
      <StatusIcon />
      <span>{getButtonText()}</span>
    </Button>
  )
}

export default OpenInIDEButton