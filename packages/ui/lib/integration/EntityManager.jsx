import { useEffect, useState, useCallback } from "react";
import { Button } from "../components/button.jsx";
import { LoadingSpinner } from "../components/LoadingSpinner.jsx";
import { Trash2, Plus, RefreshCw, TestTube, AlertCircle, CheckCircle2, WifiOff } from "lucide-react";
import { useIntegrationData } from "./context/IntegrationDataContext";
import { useEntityTest } from "./hooks/useEntityTest.js";

/**
 * EntityManager - Manage connected accounts/entities
 *
 * Displays all connected entities grouped by type.
 * Users can:
 * - View all connected accounts with health status
 * - Test entity connections
 * - Re-authenticate failed entities
 * - Connect new accounts
 * - Disconnect existing accounts
 * - Navigate to integration builder to create integrations
 *
 * v2 Features:
 * - Entity health indicators
 * - Connection testing
 * - Re-authentication flow
 * - Better error handling
 *
 * @param {function} props.onBuildIntegration - Navigate to integration builder with entity
 * @param {function} props.onConnectNewEntity - Navigate to OAuth flow for entity type
 * @param {function} props.onReauthorizeEntity - Navigate to re-auth flow for entity
 * @returns {JSX.Element} The rendered component
 */
export default function EntityManager(props) {
  const { api } = useIntegrationData();
  const [entities, setEntities] = useState([]);
  const [entitiesByType, setEntitiesByType] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deletingEntity, setDeletingEntity] = useState(null);
  const [reauthorizingEntity, setReauthorizingEntity] = useState(null);

  const { testEntity, testing, results } = useEntityTest(api);

  const loadEntities = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.listEntities();

      if (result?.error) {
        throw new Error(result.error);
      }

      const entities = result.entities || [];
      setEntities(entities);

      // Group entities by type locally
      const grouped = entities.reduce((acc, entity) => {
        const type = entity.type || 'unknown';
        if (!acc[type]) {
          acc[type] = [];
        }
        acc[type].push(entity);
        return acc;
      }, {});
      setEntitiesByType(grouped);
    } catch (err) {
      console.error("Failed to load entities:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (!api) {
      setError("API instance is required");
      return;
    }
    loadEntities();
  }, [loadEntities, api]);

  const handleDelete = async (entityId) => {
    if (!confirm("Are you sure you want to disconnect this account? This will remove any integrations using this account.")) {
      return;
    }

    setDeletingEntity(entityId);
    try {
      await api.deleteEntity(entityId);
      await loadEntities();
    } catch (err) {
      alert(`Failed to disconnect: ${err.message}`);
    } finally {
      setDeletingEntity(null);
    }
  };

  const handleTest = async (entityId) => {
    try {
      await testEntity(entityId);
    } catch (err) {
      // Error already stored in results by hook
      console.error('Test failed:', err);
    }
  };

  const handleReauthorize = async (entity) => {
    setReauthorizingEntity(entity.id);
    try {
      const reauth = await api.initiateEntityReauthorization(entity.id);

      // Store re-auth session info for recovery
      localStorage.setItem('reauth_session_id', reauth.sessionId);
      localStorage.setItem('reauth_entity_id', entity.id);
      localStorage.setItem('reauth_module_type', entity.type);

      // If OAuth, redirect
      if (reauth.requirements.type === 'oauth2') {
        const url = reauth.requirements.url;
        window.location.href = url;
      } else {
        // For form-based, trigger callback with entity and session
        props.onReauthorizeEntity?.(entity, reauth);
      }
    } catch (error) {
      console.error('Failed to start re-authorization:', error);
      alert(`Failed to start re-authorization: ${error.message}`);
      setReauthorizingEntity(null);
    }
  };

  const getEntityStatus = (entity) => {
    const testResult = results[entity.id];

    if (testResult) {
      return {
        valid: testResult.valid,
        message: testResult.message,
        canReauthorize: testResult.canReauthorize,
        tested: true
      };
    }

    // Default based on entity data
    return {
      valid: entity.isValid !== false,
      message: entity.status || 'Unknown',
      canReauthorize: true,
      tested: false
    };
  };

  const EntityHealthBadge = ({ entity }) => {
    const status = getEntityStatus(entity);
    const isTesting = testing[entity.id];

    if (isTesting) {
      return (
        <span className="inline-flex items-center px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
          <LoadingSpinner />
          <span className="ml-1">Testing...</span>
        </span>
      );
    }

    if (status.valid) {
      return (
        <span className="inline-flex items-center px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          {status.message}
        </span>
      );
    }

    return (
      <span className="inline-flex items-center px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">
        <WifiOff className="w-3 h-3 mr-1" />
        {status.message}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner />
        <span className="ml-3">Loading connected accounts...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
        <h3 className="font-semibold mb-2">Error Loading Accounts</h3>
        <p>{error}</p>
        <Button onClick={loadEntities} className="mt-3">
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Connected Accounts</h2>
          <p className="text-gray-600 mt-1">
            Manage your connected accounts and build integrations
          </p>
        </div>
        <Button onClick={loadEntities} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {entities.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-semibold mb-2">No Connected Accounts</h3>
          <p className="text-gray-600 mb-4">
            Connect your first account to start building integrations
          </p>
          <Button onClick={() => props.onConnectNewEntity?.()}>
            <Plus className="w-4 h-4 mr-2" />
            Connect Account
          </Button>
        </div>
      ) : (
        <>
          {Object.entries(entitiesByType).map(([type, typeEntities]) => (
            <div key={type} className="border rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg capitalize">{type}</h3>
                  <span className="text-sm text-gray-600">
                    {typeEntities.length} {typeEntities.length === 1 ? 'account' : 'accounts'}
                  </span>
                </div>
              </div>
              <div className="divide-y">
                {typeEntities.map((entity) => {
                  const status = getEntityStatus(entity);
                  const isDeleting = deletingEntity === entity.id;
                  const isReauthorizing = reauthorizingEntity === entity.id;

                  return (
                    <div
                      key={entity.id}
                      className="p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="font-medium">{entity.name}</h4>
                            <EntityHealthBadge entity={entity} />
                          </div>

                          {entity.externalId && (
                            <p className="text-sm text-gray-600">
                              ID: {entity.externalId}
                            </p>
                          )}

                          {!status.valid && status.tested && (
                            <div className="mt-2 flex items-start gap-2 bg-red-50 border border-red-200 rounded p-2">
                              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
                              <div className="flex-1">
                                <p className="text-sm text-red-800">
                                  Connection failed. Please reconnect this account.
                                </p>
                              </div>
                            </div>
                          )}

                          {entity.compatibleIntegrations?.length > 0 && (
                            <p className="text-sm text-gray-600 mt-1">
                              Can be used with: {entity.compatibleIntegrations.map(i => i.displayName).join(", ")}
                            </p>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleTest(entity.id)}
                            disabled={testing[entity.id]}
                            title="Test connection"
                          >
                            <TestTube className="w-4 h-4" />
                          </Button>

                          {!status.valid && status.canReauthorize && (
                            <Button
                              size="sm"
                              onClick={() => handleReauthorize(entity)}
                              disabled={isReauthorizing}
                              title="Reconnect account"
                            >
                              {isReauthorizing ? (
                                <>
                                  <LoadingSpinner />
                                  <span className="ml-2">Starting...</span>
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="w-4 h-4 mr-1" />
                                  Reconnect
                                </>
                              )}
                            </Button>
                          )}

                          {status.valid && (
                            <Button
                              size="sm"
                              onClick={() => props.onBuildIntegration?.(entity)}
                            >
                              <Plus className="w-4 h-4 mr-1" />
                              Build Integration
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(entity.id)}
                            disabled={isDeleting}
                            title="Delete account"
                          >
                            {isDeleting ? (
                              <LoadingSpinner />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="bg-gray-50 px-4 py-3 border-t">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => props.onConnectNewEntity?.(type)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Connect Another {type} Account
                </Button>
              </div>
            </div>
          ))}

          <div className="text-center pt-4">
            <Button onClick={() => props.onConnectNewEntity?.()}>
              <Plus className="w-4 h-4 mr-2" />
              Connect Different Account Type
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
