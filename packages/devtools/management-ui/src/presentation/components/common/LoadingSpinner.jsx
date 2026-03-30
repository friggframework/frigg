import React from 'react'
import { cn } from '../lib/utils'
import { Loader2 } from 'lucide-react'

const LoadingSpinner = ({ size = 'md', className, variant = 'default', ...props }) => {
  const sizeMap = {
    sm: 16,
    md: 24,
    lg: 32,
    xl: 48
  }

  const variantClasses = {
    default: 'text-primary',
    secondary: 'text-secondary',
    muted: 'text-muted-foreground'
  }

  return (
    <Loader2
      size={sizeMap[size]}
      className={cn(
        'animate-spin',
        variantClasses[variant],
        className
      )}
      {...props}
    />
  )
}

export default LoadingSpinner