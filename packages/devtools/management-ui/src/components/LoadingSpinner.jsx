import React from 'react'
<<<<<<< HEAD
<<<<<<< HEAD
=======
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
=======
>>>>>>> 7e97f01c (fix: resolve ui-command merge conflicts and update package.json)
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
<<<<<<< HEAD
<<<<<<< HEAD
=======
=======
import { cn } from '../utils/cn'
=======
import { cn } from '../lib/utils'
import { Loader2 } from 'lucide-react'
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)

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
<<<<<<< HEAD
        'animate-spin rounded-full border-2 border-gray-300 border-t-blue-600',
        sizeClasses[size],
>>>>>>> 652520a5 (Claude Flow RFC related development)
=======
        'animate-spin',
        variantClasses[variant],
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
=======
>>>>>>> 7e97f01c (fix: resolve ui-command merge conflicts and update package.json)
        className
      )}
      {...props}
    />
  )
}

<<<<<<< HEAD
<<<<<<< HEAD
=======
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
=======
>>>>>>> 7e97f01c (fix: resolve ui-command merge conflicts and update package.json)
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
<<<<<<< HEAD
<<<<<<< HEAD
=======

<<<<<<< HEAD
=======
>>>>>>> 652520a5 (Claude Flow RFC related development)
=======
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
=======
>>>>>>> 7e97f01c (fix: resolve ui-command merge conflicts and update package.json)
export default LoadingSpinner