<<<<<<< HEAD
<<<<<<< HEAD
=======
<<<<<<< HEAD
<<<<<<< HEAD
// Re-export shadcn Card components with filtered props
export {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  CardDescription,
  CardFooter
} from './ui/card'
=======
import React from 'react'
import { cn } from '../utils/cn'

const Card = ({ children, className, ...props }) => {
  return (
    <div
      className={cn(
        'bg-white shadow-sm rounded-lg border border-gray-200',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

const CardHeader = ({ children, className, ...props }) => {
  return (
    <div
      className={cn('px-6 py-4 border-b border-gray-200', className)}
      {...props}
    >
      {children}
    </div>
  )
}

const CardContent = ({ children, className, ...props }) => {
  return (
    <div className={cn('px-6 py-4', className)} {...props}>
      {children}
    </div>
  )
}

const CardTitle = ({ children, className, ...props }) => {
  return (
    <h3
      className={cn('text-lg font-medium text-gray-900', className)}
      {...props}
    >
      {children}
    </h3>
  )
}

const CardDescription = ({ children, className, ...props }) => {
  return (
    <p
      className={cn('text-sm text-gray-600 mt-1', className)}
      {...props}
    >
      {children}
    </p>
  )
}

export { Card, CardHeader, CardContent, CardTitle, CardDescription }
>>>>>>> 652520a5 (Claude Flow RFC related development)
=======
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
=======
>>>>>>> 7e97f01c (fix: resolve ui-command merge conflicts and update package.json)
// Re-export shadcn Card components with filtered props
export { 
  Card, 
  CardHeader, 
  CardContent, 
  CardTitle, 
  CardDescription,
  CardFooter 
<<<<<<< HEAD
<<<<<<< HEAD
} from './ui/card'
=======
} from './ui/card'
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
=======
} from './ui/card'
>>>>>>> 7e97f01c (fix: resolve ui-command merge conflicts and update package.json)
