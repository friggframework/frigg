import React from 'react'
import { Badge } from './ui/badge'
import { cn } from '../lib/utils'
import { Loader2, CheckCircle2, XCircle, AlertCircle, Circle } from 'lucide-react'

const StatusBadge = ({ status, className, showIcon = true, ...props }) => {
  const getStatusConfig = (status) => {
    switch (status) {
      case 'running':
        return {
          icon: CheckCircle2,
          text: 'Running',
          variant: 'default',
          className: 'bg-green-500/10 text-green-700 hover:bg-green-500/20 border-green-200 dark:bg-green-500/20 dark:text-green-400 dark:border-green-800'
        }
      case 'stopped':
        return {
          icon: XCircle,
          text: 'Stopped',
          variant: 'secondary',
          className: 'bg-red-500/10 text-red-700 hover:bg-red-500/20 border-red-200 dark:bg-red-500/20 dark:text-red-400 dark:border-red-800'
        }
      case 'starting':
        return {
          icon: Loader2,
          text: 'Starting...',
          variant: 'outline',
          className: 'bg-blue-500/10 text-blue-700 hover:bg-blue-500/20 border-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-800'
        }
      case 'error':
        return {
          icon: AlertCircle,
          text: 'Error',
          variant: 'destructive',
          className: 'bg-red-500/10 text-red-700 hover:bg-red-500/20 border-red-200 dark:bg-red-500/20 dark:text-red-400 dark:border-red-800'
        }
      case 'installed':
        return {
          icon: CheckCircle2,
          text: 'Installed',
          variant: 'default',
          className: 'bg-green-500/10 text-green-700 hover:bg-green-500/20 border-green-200 dark:bg-green-500/20 dark:text-green-400 dark:border-green-800'
        }
      default:
        return {
          icon: Circle,
          text: 'Unknown',
          variant: 'outline',
          className: ''
        }
    }
  }

  const config = getStatusConfig(status)
  const Icon = config.icon

  return (
    <Badge
      variant={config.variant}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium transition-colors',
        config.className,
        className
      )}
      {...props}
    >
      {showIcon && <Icon className="h-3 w-3" />}
      {config.text}
    </Badge>
  )
}

export default StatusBadge