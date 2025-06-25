import React, { useState, useEffect } from 'react';
import { 
  X, Download, RefreshCw, Trash2, ExternalLink, 
  Check, AlertCircle, Code, Book, Shield, Clock,
  GitBranch, Users
} from 'lucide-react';
import { Dialog } from '../../components/dialog';
import { Button } from '../../components/button';
import LoadingSpinner from '../../components/LoadingSpinner';

const IntegrationDetailModal = ({
  integration,
  isInstalled,
  isInstalling,
  onClose,
  onInstall,
  onUninstall,
  onUpdate,
  api
}) => {
  const [details, setDetails] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    loadIntegrationDetails();
  }, [integration.name]);

  const loadIntegrationDetails = async () => {
    try {
      setLoading(true);
      
      // Load detailed information
      const detailsResponse = await api.getIntegrationDetails(integration.name);
      if (detailsResponse.success) {
        setDetails(detailsResponse.data);
      }

      // Load health information
      const healthResponse = await api.getIntegrationHealth(integration.name);
      if (healthResponse.success) {
        setHealth(healthResponse.data);
      }
    } catch (error) {
      console.error('Failed to load integration details:', error);
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Book },
    { id: 'technical', label: 'Technical Details', icon: Code },
    { id: 'requirements', label: 'Requirements', icon: Shield }
  ];

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="p-6 border-b">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                {integration.logoUrl ? (
                  <img
                    src={integration.logoUrl}
                    alt={`${integration.displayName} logo`}
                    className="w-16 h-16 object-contain"
                  />
                ) : (
                  <div className="w-16 h-16 bg-gray-200 rounded flex items-center justify-center">
                    <span className="text-gray-500 text-xl font-bold">
                      {integration.displayName.charAt(0)}
                    </span>
                  </div>
                )}
                <div>
                  <h2 className="text-2xl font-bold flex items-center gap-2">
                    {integration.displayName}
                    {integration.isOfficial && (
                      <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        Official
                      </span>
                    )}
                    {isInstalled && (
                      <Check className="h-5 w-5 text-green-500" />
                    )}
                  </h2>
                  <p className="text-gray-600">{integration.category}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Action buttons */}
            <div className="mt-4 flex gap-2">
              {!isInstalled ? (
                <Button
                  onClick={onInstall}
                  disabled={isInstalling}
                >
                  {isInstalling ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Installing...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Install Integration
                    </>
                  )}
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={onUpdate}
                    disabled={!health?.updateAvailable}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {health?.updateAvailable ? 'Update Available' : 'Up to Date'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={onUninstall}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Uninstall
                  </Button>
                </>
              )}
              {details?.homepage && (
                <Button
                  variant="outline"
                  onClick={() => window.open(details.homepage, '_blank')}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View Documentation
                </Button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b">
            <div className="flex">
              {tabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`
                      px-4 py-3 flex items-center gap-2 border-b-2 transition-colors
                      ${activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-600 hover:text-gray-800'
                      }
                    `}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-280px)]">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : (
              <>
                {activeTab === 'overview' && (
                  <div className="space-y-6">
                    {/* Description */}
                    <div>
                      <h3 className="font-semibold mb-2">Description</h3>
                      <p className="text-gray-600">
                        {details?.description || integration.description || 'No description available'}
                      </p>
                    </div>

                    {/* Version info */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="font-medium text-sm text-gray-500">Current Version</h4>
                        <p className="mt-1">
                          {health?.installed ? health.version : 'Not installed'}
                        </p>
                      </div>
                      <div>
                        <h4 className="font-medium text-sm text-gray-500">Latest Version</h4>
                        <p className="mt-1">
                          {details?.version || 'Unknown'}
                        </p>
                      </div>
                    </div>

                    {/* Integration metadata */}
                    {details?.integrationMetadata && (
                      <div>
                        <h3 className="font-semibold mb-2">Integration Features</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-gray-400" />
                            <span className="text-sm">
                              Auth Type: {details.integrationMetadata.authType}
                            </span>
                          </div>
                          {details.integrationMetadata.webhooksSupported && (
                            <div className="flex items-center gap-2">
                              <AlertCircle className="h-4 w-4 text-gray-400" />
                              <span className="text-sm">Webhooks Supported</span>
                            </div>
                          )}
                          {details.integrationMetadata.sandboxAvailable && (
                            <div className="flex items-center gap-2">
                              <Code className="h-4 w-4 text-gray-400" />
                              <span className="text-sm">Sandbox Available</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Keywords */}
                    {details?.keywords && details.keywords.length > 0 && (
                      <div>
                        <h3 className="font-semibold mb-2">Keywords</h3>
                        <div className="flex flex-wrap gap-2">
                          {details.keywords.map(keyword => (
                            <span
                              key={keyword}
                              className="px-2 py-1 bg-gray-100 text-gray-700 text-sm rounded"
                            >
                              {keyword}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'technical' && (
                  <div className="space-y-6">
                    {/* Package info */}
                    <div>
                      <h3 className="font-semibold mb-2">Package Information</h3>
                      <div className="bg-gray-50 p-4 rounded font-mono text-sm">
                        <div className="mb-2">
                          <span className="text-gray-500">Package:</span> {integration.name}
                        </div>
                        <div className="mb-2">
                          <span className="text-gray-500">Install:</span> {integration.installCommand}
                        </div>
                        {details?.license && (
                          <div>
                            <span className="text-gray-500">License:</span> {details.license}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Repository */}
                    {details?.repository && (
                      <div>
                        <h3 className="font-semibold mb-2 flex items-center gap-2">
                          <GitBranch className="h-4 w-4" />
                          Repository
                        </h3>
                        <a
                          href={details.repository.url || details.repository}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          {details.repository.url || details.repository}
                        </a>
                      </div>
                    )}

                    {/* Maintainers */}
                    {details?.maintainers && details.maintainers.length > 0 && (
                      <div>
                        <h3 className="font-semibold mb-2 flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Maintainers
                        </h3>
                        <div className="space-y-2">
                          {details.maintainers.map(maintainer => (
                            <div key={maintainer.email} className="text-sm">
                              {maintainer.name} ({maintainer.email})
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Published date */}
                    {details?.publishedAt && (
                      <div>
                        <h3 className="font-semibold mb-2 flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          Last Published
                        </h3>
                        <p className="text-sm text-gray-600">
                          {new Date(details.publishedAt).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'requirements' && (
                  <div className="space-y-6">
                    {/* Dependencies */}
                    {details?.dependencies && Object.keys(details.dependencies).length > 0 && (
                      <div>
                        <h3 className="font-semibold mb-2">Dependencies</h3>
                        <div className="bg-gray-50 p-4 rounded">
                          {Object.entries(details.dependencies).map(([name, version]) => (
                            <div key={name} className="font-mono text-sm mb-1">
                              {name}: {version}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Peer Dependencies */}
                    {details?.peerDependencies && Object.keys(details.peerDependencies).length > 0 && (
                      <div>
                        <h3 className="font-semibold mb-2">Peer Dependencies</h3>
                        <div className="bg-gray-50 p-4 rounded">
                          {Object.entries(details.peerDependencies).map(([name, version]) => (
                            <div key={name} className="font-mono text-sm mb-1">
                              {name}: {version}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Required scopes */}
                    {details?.integrationMetadata?.requiredScopes && 
                     details.integrationMetadata.requiredScopes.length > 0 && (
                      <div>
                        <h3 className="font-semibold mb-2">Required OAuth Scopes</h3>
                        <ul className="list-disc list-inside space-y-1">
                          {details.integrationMetadata.requiredScopes.map(scope => (
                            <li key={scope} className="text-sm text-gray-600">
                              {scope}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
};

export default IntegrationDetailModal;