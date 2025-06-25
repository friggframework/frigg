import React from 'react'
import { cn } from '../utils/cn'

const StatusBadge = ({ status, className, showIcon = true, ...props }) => {
  const getStatusConfig = (status) => {
    switch (status) {
      case 'running':
        return {
          icon: '●',
          text: 'Running',
          className: 'bg-green-100 text-green-800 border-green-200'
        }
      case 'stopped':
        return {
          icon: '○',
          text: 'Stopped',
          className: 'bg-red-100 text-red-800 border-red-200'
        }
      case 'starting':
        return {
          icon: '◐',
          text: 'Starting...',
          className: 'bg-yellow-100 text-yellow-800 border-yellow-200'
        }
      case 'error':
        return {
          icon: '✕',
          text: 'Error',
          className: 'bg-red-100 text-red-800 border-red-200'
        }
      default:
        return {
          icon: '?',
          text: 'Unknown',
          className: 'bg-gray-100 text-gray-800 border-gray-200'
        }
    }
  }

  const config = getStatusConfig(status)

  return (
    <span 
      className={cn(
        'inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border',
        config.className,
        className
      )}
      {...props}
    >
      {showIcon && <span className="mr-1">{config.icon}</span>}
      {config.text}
    </span>
  )
}

export default StatusBadge