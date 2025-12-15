/**
 * PermissionPrompt - Displays pending tool permission requests
 *
 * Shows approval prompts for tool uses that require user consent.
 * Appears as a floating banner above the chat input.
 */

import React from 'react'
import { cn } from '../../../lib/utils'
import { Button } from '../ui/button'
import { usePermissions } from './FriggRuntimeProvider'
import {
  Shield,
  Check,
  X,
  Eye,
  Edit,
  Terminal,
  Search,
  FileCode,
  Globe,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react'

// Tool icons mapping
const TOOL_ICONS = {
  Read: Eye,
  Write: Edit,
  Edit: Edit,
  Glob: Search,
  Grep: Search,
  Bash: Terminal,
  Task: FileCode,
  WebFetch: Globe,
  WebSearch: Globe,
  default: FileCode,
}

// Tool risk levels
const TOOL_RISK = {
  Read: 'low',
  Glob: 'low',
  Grep: 'low',
  Write: 'medium',
  Edit: 'medium',
  Bash: 'high',
  Task: 'medium',
  WebFetch: 'low',
  WebSearch: 'low',
}

const getRiskColor = (risk) => {
  switch (risk) {
    case 'high':
      return 'text-red-500 bg-red-500/10 border-red-500/30'
    case 'medium':
      return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30'
    default:
      return 'text-blue-500 bg-blue-500/10 border-blue-500/30'
  }
}

/**
 * Single permission request item
 */
const PermissionItem = ({ request, onApprove, onDeny }) => {
  const [expanded, setExpanded] = React.useState(false)
  const Icon = TOOL_ICONS[request.toolName] || TOOL_ICONS.default
  const risk = TOOL_RISK[request.toolName] || 'low'
  const riskColor = getRiskColor(risk)

  return (
    <div className={cn(
      'border rounded-lg overflow-hidden',
      riskColor
    )}>
      {/* Header */}
      <div className="flex items-center gap-3 p-3">
        <div className={cn('p-2 rounded-md', riskColor.split(' ')[1])}>
          <Icon className="w-4 h-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">{request.toolName}</span>
            {risk === 'high' && (
              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
            )}
          </div>
          <p className="text-sm text-muted-foreground truncate">
            {request.description}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="h-8 px-2"
          >
            {expanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onDeny(request.requestId)}
            className="h-8 px-3 text-red-500 hover:text-red-600 hover:bg-red-500/10"
          >
            <X className="w-4 h-4 mr-1" />
            Deny
          </Button>

          <Button
            size="sm"
            onClick={() => onApprove(request.requestId)}
            className="h-8 px-3 bg-green-600 hover:bg-green-700"
          >
            <Check className="w-4 h-4 mr-1" />
            Allow
          </Button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && request.input && (
        <div className="border-t border-border/50 p-3 bg-background/50 max-h-48 overflow-y-auto">
          <div className="text-xs text-muted-foreground mb-1">Parameters:</div>
          <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(request.input, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

/**
 * Main permission prompt component
 */
export function PermissionPrompt({ className }) {
  const { pendingPermissions, approvePermission, denyPermission } = usePermissions()

  if (pendingPermissions.length === 0) {
    return null
  }

  // Approve all pending permissions
  const handleApproveAll = () => {
    pendingPermissions.forEach(p => approvePermission(p.requestId))
  }

  // Deny all pending permissions
  const handleDenyAll = () => {
    pendingPermissions.forEach(p => denyPermission(p.requestId))
  }

  return (
    <div className={cn(
      'border-t border-border bg-background/95 backdrop-blur-sm p-4',
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-purple-500" />
          <span className="font-medium text-foreground">
            Permission Required
          </span>
          <span className="text-sm text-muted-foreground">
            ({pendingPermissions.length} {pendingPermissions.length === 1 ? 'request' : 'requests'})
          </span>
        </div>

        {pendingPermissions.length > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDenyAll}
              className="h-7 text-xs"
            >
              Deny All
            </Button>
            <Button
              size="sm"
              onClick={handleApproveAll}
              className="h-7 text-xs bg-green-600 hover:bg-green-700"
            >
              Allow All
            </Button>
          </div>
        )}
      </div>

      {/* Permission requests */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {pendingPermissions.map(request => (
          <PermissionItem
            key={request.requestId}
            request={request}
            onApprove={approvePermission}
            onDeny={denyPermission}
          />
        ))}
      </div>
    </div>
  )
}

export default PermissionPrompt
