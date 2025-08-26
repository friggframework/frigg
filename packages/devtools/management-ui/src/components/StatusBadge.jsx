import React from 'react'
<<<<<<< HEAD
<<<<<<< HEAD
import { Badge } from './ui/badge'
import { cn } from '../lib/utils'
import { Loader2, CheckCircle2, XCircle, AlertCircle, Circle } from 'lucide-react'
=======
<<<<<<< HEAD
<<<<<<< HEAD
import { Badge } from './ui/badge'
import { cn } from '../lib/utils'
import { Loader2, CheckCircle2, XCircle, AlertCircle, Circle } from 'lucide-react'
=======
import { cn } from '../utils/cn'
>>>>>>> 652520a5 (Claude Flow RFC related development)
=======
import { Badge } from './ui/badge'
import { cn } from '../lib/utils'
import { Loader2, CheckCircle2, XCircle, AlertCircle, Circle } from 'lucide-react'
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
=======
import { Badge } from './ui/badge'
import { cn } from '../lib/utils'
import { Loader2, CheckCircle2, XCircle, AlertCircle, Circle } from 'lucide-react'
>>>>>>> 7e97f01c (fix: resolve ui-command merge conflicts and update package.json)

const StatusBadge = ({ status, className, showIcon = true, ...props }) => {
  const getStatusConfig = (status) => {
    switch (status) {
      case 'running':
        return {
<<<<<<< HEAD
<<<<<<< HEAD
=======
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
=======
>>>>>>> 7e97f01c (fix: resolve ui-command merge conflicts and update package.json)
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
          className: 'bg-yellow-500/10 text-yellow-700 hover:bg-yellow-500/20 border-yellow-300 dark:bg-yellow-500/20 dark:text-yellow-400 dark:border-yellow-800',
          iconClassName: 'animate-spin'
        }
      case 'error':
        return {
          icon: AlertCircle,
          text: 'Error',
          variant: 'destructive',
          className: ''
        }
      default:
        return {
          icon: Circle,
          text: 'Unknown',
          variant: 'outline',
          className: ''
<<<<<<< HEAD
<<<<<<< HEAD
=======
=======
          icon: '●',
=======
          icon: CheckCircle2,
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
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
          className: 'bg-yellow-500/10 text-yellow-700 hover:bg-yellow-500/20 border-yellow-300 dark:bg-yellow-500/20 dark:text-yellow-400 dark:border-yellow-800',
          iconClassName: 'animate-spin'
        }
      case 'error':
        return {
          icon: AlertCircle,
          text: 'Error',
          variant: 'destructive',
          className: ''
        }
      default:
        return {
          icon: Circle,
          text: 'Unknown',
<<<<<<< HEAD
          className: 'bg-gray-100 text-gray-800 border-gray-200'
>>>>>>> 652520a5 (Claude Flow RFC related development)
=======
          variant: 'outline',
          className: ''
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
=======
>>>>>>> 7e97f01c (fix: resolve ui-command merge conflicts and update package.json)
        }
    }
  }

  const config = getStatusConfig(status)
<<<<<<< HEAD
<<<<<<< HEAD
=======
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
=======
>>>>>>> 7e97f01c (fix: resolve ui-command merge conflicts and update package.json)
  const Icon = config.icon

  return (
    <Badge
      variant={config.variant}
      className={cn(
        'gap-1.5 px-3 py-1 font-medium industrial-transition sharp-badge',
<<<<<<< HEAD
<<<<<<< HEAD
=======
=======
=======
  const Icon = config.icon
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)

  return (
    <Badge 
      variant={config.variant}
      className={cn(
<<<<<<< HEAD
        'inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border',
>>>>>>> 652520a5 (Claude Flow RFC related development)
=======
        'gap-1.5 px-3 py-1 font-medium industrial-transition sharp-badge',
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
=======
>>>>>>> 7e97f01c (fix: resolve ui-command merge conflicts and update package.json)
        config.className,
        className
      )}
      {...props}
    >
<<<<<<< HEAD
<<<<<<< HEAD
=======
<<<<<<< HEAD
<<<<<<< HEAD
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
=======
>>>>>>> 7e97f01c (fix: resolve ui-command merge conflicts and update package.json)
      {showIcon && (
        <Icon size={14} className={cn('', config.iconClassName)} />
      )}
      {config.text}
    </Badge>
  )
}

export { StatusBadge }
<<<<<<< HEAD
<<<<<<< HEAD
=======
=======
      {showIcon && <span className="mr-1">{config.icon}</span>}
=======
      {showIcon && (
        <Icon size={14} className={cn('', config.iconClassName)} />
      )}
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
      {config.text}
    </Badge>
  )
}

<<<<<<< HEAD
>>>>>>> 652520a5 (Claude Flow RFC related development)
=======
export { StatusBadge }
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
>>>>>>> 860052b4 (feat: integrate complete management-ui and additional features)
=======
>>>>>>> 7e97f01c (fix: resolve ui-command merge conflicts and update package.json)
export default StatusBadge