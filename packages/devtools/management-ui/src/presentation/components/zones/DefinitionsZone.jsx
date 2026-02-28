import { useFrigg } from '../../hooks/useFrigg'
import OpenInIDEButton from '../common/OpenInIDEButton'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog'
import { cn } from '../../../lib/utils'
import {
  CheckCircle,
  TestTube,
  GitBranch,
  Package,
  Users,
  Globe,
  Settings,
  Code,
  Shield,
  Database,
  Network,
  Terminal,
  Key,
  Sparkles,
  Info,
  X
} from 'lucide-react'
import { useState } from 'react'

// Fixed Environment icon import issue
const DefinitionsZone = ({ className }) => {
  const [selectedIntegrationForDialog, setSelectedIntegrationForDialog] = useState(null)

  try {
    const friggContext = useFrigg()

    const {
      integrations = [],
      selectIntegration = () => { },
      switchZone = () => { },
      loading = false,
      status = 'stopped',
      appDefinition = null,
      currentProject = '',
      currentRepository = null
    } = friggContext || {}

    // Safety check to prevent errors when data is not yet loaded
    const displayIntegrations = integrations || []
    const safeAppDefinition = appDefinition || null

    // Early return if critical data is missing to prevent errors
    if (!displayIntegrations && !safeAppDefinition && loading === false) {
      return (
        <div className={cn('h-full flex flex-col', className)}>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-lg font-semibold text-foreground mb-2">No Data Available</h2>
              <p className="text-sm text-muted-foreground">Unable to load project data</p>
            </div>
          </div>
        </div>
      )
    }

    const handleViewIntegration = (integration) => {
      // Show integration details in modal instead of redirecting
      setSelectedIntegrationForDialog(integration)
    }

    const handleTestIntegration = (integration) => {
      selectIntegration(integration)
      switchZone('testing')
    }

    // Get the app name from the definition using the new structure
    // Priority: label (display name) > name > packageName > currentProject > fallback
    const appName = safeAppDefinition?.label || safeAppDefinition?.name || safeAppDefinition?.packageName || currentProject || 'Frigg Application'

    return (
      <div className={cn('h-full flex flex-col', className)}>
        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading app definition...</p>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Welcome Header */}
              <div className="bg-gradient-to-r from-primary/5 to-primary/10 p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <Sparkles className="h-8 w-8 text-primary" />
                      <div>
                        <h1 className="text-3xl font-bold text-foreground">{appName}</h1>
                        <p className="text-lg text-muted-foreground">
                          Frigg Management Dashboard
                        </p>
                      </div>
                    </div>
                    <div className="bg-background/80 border border-primary/20 rounded-lg p-4 mb-4">
                      <p className="text-sm text-foreground leading-relaxed">
                        Welcome to your Frigg application management dashboard! Here you can view your application configuration,
                        manage integrations, and access development tools. Use the settings panel to configure your development
                        environment and IDE preferences.
                      </p>
                    </div>
                    <div className="flex items-center gap-6 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        <span>Ready to explore</span>
                      </div>
                      {currentRepository && (
                        <div className="flex items-center gap-2">
                          <GitBranch className="w-4 h-4" />
                          <span>Branch: {currentRepository.git?.currentBranch || currentRepository.gitBranch || currentRepository.branch || 'Unknown'}</span>
                        </div>
                      )}
                      {displayIntegrations.length > 0 && (
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4" />
                          <span>{displayIntegrations.length} integration{displayIntegrations.length !== 1 ? 's' : ''} available</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 ml-6">
                    <OpenInIDEButton filePath={currentRepository?.path} />
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-8">
                {/* Frigg Application Settings Section */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="w-5 h-5" />
                      Frigg Application Settings
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Application Overview */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <Code className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide">Version</label>
                          <p className="text-sm font-semibold text-foreground">{safeAppDefinition?.version || '1.0.0'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                        <div className="p-2 bg-green-500/10 rounded-lg">
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</label>
                          <Badge variant={status === 'running' ? 'default' : 'secondary'} className="capitalize text-xs">
                            {status}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                        <div className="p-2 bg-blue-500/10 rounded-lg">
                          <Terminal className="h-5 w-5 text-blue-500" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide">Environment</label>
                          <p className="text-sm font-semibold text-foreground">Local Development</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                        <div className="p-2 bg-purple-500/10 rounded-lg">
                          <Package className="h-5 w-5 text-purple-500" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide">Framework</label>
                          <p className="text-sm font-semibold text-foreground">Frigg v2+</p>
                        </div>
                      </div>
                    </div>

                    {/* Description */}
                    {safeAppDefinition?.description && (
                      <div>
                        <label className="block text-sm font-medium mb-2">Description</label>
                        <p className="text-sm text-muted-foreground">{safeAppDefinition.description}</p>
                      </div>
                    )}

                    {/* Integrations & API Modules */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium mb-2">Integrations</label>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-lg px-3 py-1">
                            {displayIntegrations.length}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {displayIntegrations.length === 1 ? 'integration' : 'integrations'} available
                          </span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-2">API Modules</label>
                        <div className="space-y-2">
                          {displayIntegrations.length > 0 ? (
                            (() => {
                              const allModules = new Set()
                              displayIntegrations.forEach(integration => {
                                if (integration.modules && typeof integration.modules === 'object') {
                                  Object.entries(integration.modules).forEach(([key, module]) => {
                                    // Handle both the backend structure and frontend expectations
                                    const moduleName = module.name || module.definition?.moduleName || key
                                    allModules.add(moduleName)
                                  })
                                }
                              })
                              return Array.from(allModules).length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {Array.from(allModules).map((moduleName, index) => (
                                    <Badge key={index} variant="secondary" className="text-xs">
                                      {moduleName}
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">No modules detected</p>
                              )
                            })()
                          ) : (
                            <p className="text-sm text-muted-foreground">No modules detected</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Application Configuration */}
                    {safeAppDefinition?.config ? (
                      <div className="border-t border-border pt-6">
                        <div className="flex items-center gap-2 mb-6">
                          <Settings className="h-5 w-5 text-primary" />
                          <h3 className="text-lg font-semibold text-foreground">Application Configuration</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                          {/* Custom Configuration */}
                          {safeAppDefinition.config.custom && Object.keys(safeAppDefinition.config.custom).length > 0 && (
                            <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
                              <CardHeader className="pb-3">
                                <CardTitle className="flex items-center gap-2 text-primary text-base">
                                  <Sparkles className="h-4 w-4" />
                                  Custom Settings
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-3">
                                {Object.entries(safeAppDefinition.config.custom).map(([key, value]) => (
                                  <div key={key} className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-foreground">{key}</span>
                                    <Badge variant="secondary" className="text-xs">
                                      {typeof value === 'boolean' ? (value ? 'Enabled' : 'Disabled') :
                                        typeof value === 'string' ? value : 'Configured'}
                                    </Badge>
                                  </div>
                                ))}
                              </CardContent>
                            </Card>
                          )}

                          {/* User Configuration */}
                          {safeAppDefinition.config.user && Object.keys(safeAppDefinition.config.user).length > 0 && (
                            <Card className="bg-gradient-to-br from-blue-500/5 to-blue-500/10 border-blue-500/20">
                              <CardHeader className="pb-3">
                                <CardTitle className="flex items-center gap-2 text-blue-600 text-base">
                                  <Users className="h-4 w-4" />
                                  User Management
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-3">
                                {Object.entries(safeAppDefinition.config.user).map(([key, value]) => (
                                  <div key={key} className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-foreground">
                                      {key === 'password' ? 'Password Authentication' : key}
                                    </span>
                                    <Badge variant={value ? 'default' : 'secondary'} className="text-xs">
                                      {typeof value === 'boolean' ? (value ? 'Enabled' : 'Disabled') : 'Configured'}
                                    </Badge>
                                  </div>
                                ))}
                              </CardContent>
                            </Card>
                          )}

                          {/* Encryption Configuration */}
                          {safeAppDefinition.config.encryption && Object.keys(safeAppDefinition.config.encryption).length > 0 && (
                            <Card className="bg-gradient-to-br from-green-500/5 to-green-500/10 border-green-500/20">
                              <CardHeader className="pb-3">
                                <CardTitle className="flex items-center gap-2 text-green-600 text-base">
                                  <Shield className="h-4 w-4" />
                                  Encryption & Security
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-3">
                                {Object.entries(safeAppDefinition.config.encryption).map(([key, value]) => (
                                  <div key={key} className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-foreground">
                                      {key === 'fieldLevelEncryptionMethod' ? 'Field Encryption' :
                                        key === 'createResourceIfNoneFound' ? 'Auto-create Resources' : key}
                                    </span>
                                    <Badge variant={value ? 'default' : 'secondary'} className="text-xs">
                                      {typeof value === 'boolean' ? (value ? 'Enabled' : 'Disabled') :
                                        typeof value === 'string' ? value : 'Configured'}
                                    </Badge>
                                  </div>
                                ))}
                              </CardContent>
                            </Card>
                          )}

                          {/* VPC Configuration */}
                          {safeAppDefinition.config.vpc && Object.keys(safeAppDefinition.config.vpc).length > 0 && (
                            <Card className="bg-gradient-to-br from-purple-500/5 to-purple-500/10 border-purple-500/20">
                              <CardHeader className="pb-3">
                                <CardTitle className="flex items-center gap-2 text-purple-600 text-base">
                                  <Network className="h-4 w-4" />
                                  Network & VPC
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-3">
                                {Object.entries(safeAppDefinition.config.vpc).map(([key, value]) => (
                                  <div key={key} className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-foreground">
                                      {key === 'enable' ? 'VPC Enabled' :
                                        key === 'management' ? 'VPC Management' :
                                          key === 'subnets' ? 'Subnet Configuration' :
                                            key === 'natGateway' ? 'NAT Gateway' :
                                              key === 'selfHeal' ? 'Auto-healing' : key}
                                    </span>
                                    <Badge variant={value ? 'default' : 'secondary'} className="text-xs">
                                      {typeof value === 'boolean' ? (value ? 'Enabled' : 'Disabled') :
                                        typeof value === 'string' ? value :
                                          typeof value === 'object' && value !== null ? 'Configured' : 'Set'}
                                    </Badge>
                                  </div>
                                ))}
                              </CardContent>
                            </Card>
                          )}

                          {/* Database Configuration */}
                          {safeAppDefinition.config.database && Object.keys(safeAppDefinition.config.database).length > 0 && (
                            <Card className="bg-gradient-to-br from-orange-500/5 to-orange-500/10 border-orange-500/20">
                              <CardHeader className="pb-3">
                                <CardTitle className="flex items-center gap-2 text-orange-600 text-base">
                                  <Database className="h-4 w-4" />
                                  Database Configuration
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-3">
                                {Object.entries(safeAppDefinition.config.database).map(([key, value]) => (
                                  <div key={key} className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-foreground">
                                      {key === 'mongoDB' ? 'MongoDB' :
                                        key === 'documentDB' ? 'DocumentDB' : key}
                                    </span>
                                    <Badge variant={value && typeof value === 'object' && value.enable ? 'default' : 'secondary'} className="text-xs">
                                      {typeof value === 'boolean' ? (value ? 'Enabled' : 'Disabled') :
                                        typeof value === 'object' && value !== null ?
                                          (value.enable ? 'Enabled' : 'Disabled') : 'Configured'}
                                    </Badge>
                                  </div>
                                ))}
                              </CardContent>
                            </Card>
                          )}

                          {/* SSM Configuration */}
                          {safeAppDefinition.config.ssm && Object.keys(safeAppDefinition.config.ssm).length > 0 && (
                            <Card className="bg-gradient-to-br from-indigo-500/5 to-indigo-500/10 border-indigo-500/20">
                              <CardHeader className="pb-3">
                                <CardTitle className="flex items-center gap-2 text-indigo-600 text-base">
                                  <Key className="h-4 w-4" />
                                  Parameter Store (SSM)
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-3">
                                {Object.entries(safeAppDefinition.config.ssm).map(([key, value]) => (
                                  <div key={key} className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-foreground">
                                      {key === 'enable' ? 'SSM Enabled' : key}
                                    </span>
                                    <Badge variant={value ? 'default' : 'secondary'} className="text-xs">
                                      {typeof value === 'boolean' ? (value ? 'Enabled' : 'Disabled') : 'Configured'}
                                    </Badge>
                                  </div>
                                ))}
                              </CardContent>
                            </Card>
                          )}

                          {/* Environment Variables */}
                          {safeAppDefinition.config.environment && Object.keys(safeAppDefinition.config.environment).length > 0 && (
                            <Card className="bg-gradient-to-br from-cyan-500/5 to-cyan-500/10 border-cyan-500/20 md:col-span-2">
                              <CardHeader className="pb-3">
                                <CardTitle className="flex items-center gap-2 text-cyan-600 text-base">
                                  <Terminal className="h-4 w-4" />
                                  Environment Variables
                                  <Badge variant="outline" className="ml-2 text-xs">
                                    {Object.keys(safeAppDefinition.config.environment).length} variables
                                  </Badge>
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {Object.entries(safeAppDefinition.config.environment).slice(0, 8).map(([key, value]) => (
                                    <div key={key} className="flex items-center justify-between p-2 bg-background/50 rounded">
                                      <span className="text-sm font-medium text-foreground">{key}</span>
                                      <Badge variant={value ? 'default' : 'secondary'} className="text-xs">
                                        {typeof value === 'boolean' ? (value ? 'Required' : 'Optional') : 'Set'}
                                      </Badge>
                                    </div>
                                  ))}
                                </div>
                                {Object.keys(safeAppDefinition.config.environment).length > 8 && (
                                  <div className="mt-3 text-xs text-muted-foreground text-center">
                                    +{Object.keys(safeAppDefinition.config.environment).length - 8} more environment variables
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="border-t border-border pt-6">
                        <div className="flex items-center gap-2 mb-4">
                          <Settings className="h-5 w-5 text-primary" />
                          <h3 className="text-lg font-semibold text-foreground">Application Configuration</h3>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          <p>Configuration data not available. App Definition structure:</p>
                          <pre className="mt-2 p-3 bg-muted rounded text-xs overflow-auto max-h-40">
                            {JSON.stringify(safeAppDefinition, null, 2)}
                          </pre>
                          <p className="mt-2 text-xs">
                            This suggests the backend may need to be restarted to pick up configuration loading changes.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Quick Actions */}
                    <div className="border-t border-border pt-4">
                      <label className="block text-sm font-medium mb-3">Quick Actions</label>
                      <div className="flex flex-wrap gap-3">
                        <OpenInIDEButton
                          filePath={currentRepository?.path}
                          variant="outline"
                          size="sm"
                        />
                        <Button variant="outline" size="sm" disabled>
                          <Settings className="w-4 h-4 mr-2" />
                          Configure Environment
                        </Button>
                        <Button variant="outline" size="sm" disabled>
                          <Code className="w-4 h-4 mr-2" />
                          View Source Code
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Integrations Section */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-foreground">Integration Definitions</h2>
                    <Badge variant="outline">
                      {displayIntegrations.length} {displayIntegrations.length === 1 ? 'integration' : 'integrations'}
                    </Badge>
                  </div>

                  {displayIntegrations.length === 0 ? (
                    <Card>
                      <CardContent className="flex items-center justify-center h-32">
                        <div className="text-center">
                          <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
                            <Package className="w-6 h-6 text-muted-foreground" />
                          </div>
                          <h3 className="text-lg font-medium text-foreground mb-2">No Integrations Found</h3>
                          <p className="text-muted-foreground">No integrations are currently defined in this repository.</p>
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {displayIntegrations.map((integration) => (
                        <Card key={integration.name} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => handleViewIntegration(integration)}>
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-base flex items-center gap-2">
                                <div className="w-8 h-8 bg-primary/10 rounded flex items-center justify-center">
                                  {integration.logo ? (
                                    <img
                                      src={integration.logo}
                                      alt={integration.displayName || integration.name}
                                      className="w-5 h-5 object-contain"
                                      onError={(e) => {
                                        e.target.style.display = 'none'
                                        e.target.nextSibling.style.display = 'block'
                                      }}
                                    />
                                  ) : null}
                                  <Globe className="w-4 h-4 text-primary" style={{ display: integration.logo ? 'none' : 'block' }} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate font-medium">
                                    {integration.displayName || integration.name}
                                  </div>
                                  {integration.name !== integration.displayName && (
                                    <div className="text-xs text-muted-foreground truncate">
                                      {integration.name}
                                    </div>
                                  )}
                                </div>
                              </CardTitle>
                              <Badge variant={integration.status === 'ENABLED' ? 'default' : integration.status === 'NEEDS_CONFIG' ? 'secondary' : 'outline'} className="text-xs">
                                {integration.status === 'ENABLED' ? 'Active' :
                                  integration.status === 'NEEDS_CONFIG' ? 'Needs Config' :
                                    integration.status === 'DISABLED' ? 'Disabled' :
                                      integration.status === 'ERROR' ? 'Error' :
                                        integration.status}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="pt-0">
                            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                              {integration.description || 'No description available'}
                            </p>

                            {/* API Modules Used */}
                            {integration.modules && typeof integration.modules === 'object' && Object.keys(integration.modules).length > 0 && (
                              <div className="mb-3">
                                <div className="text-xs font-medium text-muted-foreground mb-1">API Modules:</div>
                                <div className="flex flex-wrap gap-1">
                                  {Object.entries(integration.modules).map(([key, module]) => {
                                    // Handle both backend structure and frontend expectations
                                    const moduleName = module.name || module.definition?.moduleName || key
                                    const moduleSource = module.source || 'unknown'
                                    return (
                                      <Badge key={key} variant="secondary" className="text-xs" title={`Source: ${moduleSource}`}>
                                        {moduleName}
                                      </Badge>
                                    )
                                  })}
                                </div>
                              </div>
                            )}

                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {integration.category && (
                                  <Badge variant="outline" className="text-xs">
                                    {integration.category}
                                  </Badge>
                                )}
                                {integration.version && (
                                  <span className="text-xs text-muted-foreground">v{integration.version}</span>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleTestIntegration(integration)
                                }}
                              >
                                <TestTube className="w-3 h-3 mr-1" />
                                Test
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Integration Details Dialog */}
        <Dialog open={!!selectedIntegrationForDialog} onOpenChange={(open) => !open && setSelectedIntegrationForDialog(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            {selectedIntegrationForDialog && (
              <>
                <DialogHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-primary/10 rounded flex items-center justify-center">
                      {selectedIntegrationForDialog.logo ? (
                        <img
                          src={selectedIntegrationForDialog.logo}
                          alt={selectedIntegrationForDialog.displayName || selectedIntegrationForDialog.name}
                          className="w-6 h-6 object-contain"
                          onError={(e) => {
                            e.target.style.display = 'none'
                            e.target.nextSibling.style.display = 'block'
                          }}
                        />
                      ) : null}
                      <Globe className="w-5 h-5 text-primary" style={{ display: selectedIntegrationForDialog.logo ? 'none' : 'block' }} />
                    </div>
                    <div className="flex-1">
                      <DialogTitle className="text-xl">
                        {selectedIntegrationForDialog.displayName || selectedIntegrationForDialog.name}
                      </DialogTitle>
                      {selectedIntegrationForDialog.name !== selectedIntegrationForDialog.displayName && (
                        <p className="text-sm text-muted-foreground">{selectedIntegrationForDialog.name}</p>
                      )}
                    </div>
                    <Badge variant={selectedIntegrationForDialog.status === 'ENABLED' ? 'default' : 'secondary'}>
                      {selectedIntegrationForDialog.status === 'ENABLED' ? 'Active' : selectedIntegrationForDialog.status}
                    </Badge>
                  </div>
                  <DialogDescription className="text-base">
                    {selectedIntegrationForDialog.description || 'No description available'}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 mt-4">
                  {/* Testing Notice */}
                  <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-3">
                        <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                            Want to test this integration?
                          </p>
                          <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                            To test this integration, head to the{' '}
                            <button
                              onClick={() => {
                                setSelectedIntegrationForDialog(null)
                                switchZone('testing')
                              }}
                              className="font-semibold underline hover:text-blue-900 dark:hover:text-blue-100"
                            >
                              Test Area
                            </button>{' '}
                            and start your Frigg app!
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* API Modules */}
                  {selectedIntegrationForDialog.modules && typeof selectedIntegrationForDialog.modules === 'object' && Object.keys(selectedIntegrationForDialog.modules).length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2">API Modules</h3>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(selectedIntegrationForDialog.modules).map(([key, module]) => {
                          const moduleName = module.name || module.definition?.moduleName || key
                          const moduleSource = module.source || 'unknown'
                          return (
                            <Badge key={key} variant="secondary" title={`Source: ${moduleSource}`}>
                              {moduleName}
                            </Badge>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Metadata */}
                  <div className="grid grid-cols-2 gap-4">
                    {selectedIntegrationForDialog.category && (
                      <div>
                        <h3 className="text-sm font-semibold mb-1">Category</h3>
                        <Badge variant="outline">{selectedIntegrationForDialog.category}</Badge>
                      </div>
                    )}
                    {selectedIntegrationForDialog.version && (
                      <div>
                        <h3 className="text-sm font-semibold mb-1">Version</h3>
                        <p className="text-sm text-muted-foreground">v{selectedIntegrationForDialog.version}</p>
                      </div>
                    )}
                  </div>

                  {/* Raw Definition (for debugging) */}
                  {process.env.NODE_ENV === 'development' && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                        View Raw Definition (Debug)
                      </summary>
                      <pre className="mt-2 p-3 bg-muted rounded overflow-auto max-h-60">
                        {JSON.stringify(selectedIntegrationForDialog, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>

                <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
                  <Button variant="outline" onClick={() => setSelectedIntegrationForDialog(null)}>
                    Close
                  </Button>
                  <Button onClick={() => {
                    selectIntegration(selectedIntegrationForDialog)
                    setSelectedIntegrationForDialog(null)
                    switchZone('testing')
                  }}>
                    <TestTube className="w-4 h-4 mr-2" />
                    Test Integration
                  </Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    )
  } catch (error) {
    console.error('Error in DefinitionsZone:', error)
    return (
        <div className={cn('h-full flex flex-col', className)}>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-lg font-semibold text-foreground mb-2">Error Loading Data</h2>
              <p className="text-sm text-muted-foreground mb-4">
                An error occurred while loading the project data
              </p>
              <div className="text-xs text-muted-foreground bg-muted p-3 rounded max-w-md mx-auto">
                <pre className="whitespace-pre-wrap">{error.message}</pre>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.reload()}
                className="mt-4"
              >
                Reload Page
              </Button>
            </div>
          </div>
        </div>
        )
  }
}

        export default DefinitionsZone