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

// Full page loading spinner with industrial design
export const LoadingPage = ({ message = 'Loading...' }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <div className="relative">
        <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse" />
        <LoadingSpinner size="xl" className="relative" />
      </div>
      <p className="text-sm text-muted-foreground font-medium">{message}</p>
    </div>
  )
}

export default LoadingSpinner