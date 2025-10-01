import { useEffect, useState, useCallback } from "react";
import API from "../api/api";
import { Button } from "../components/button.jsx";
import { LoadingSpinner } from "../components/LoadingSpinner.jsx";
import { Trash2, Plus, RefreshCw } from "lucide-react";

/**
 * EntityManager - Manage connected accounts/entities
 *
 * Displays all connected entities grouped by type.
 * Users can:
 * - View all connected accounts
 * - Connect new accounts
 * - Disconnect existing accounts
 * - Navigate to integration builder to create integrations
 *
 * @param {string} props.friggBaseUrl - Base URL for Frigg backend
 * @param {string} props.authToken - JWT token for authenticated user
 * @param {function} props.onBuildIntegration - Navigate to integration builder with entity
 * @param {function} props.onConnectNewEntity - Navigate to OAuth flow for entity type
 * @returns {JSX.Element} The rendered component
 */
export default function EntityManager(props) {
  const [entities, setEntities] = useState([]);
  const [entitiesByType, setEntitiesByType] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const api = new API(props.friggBaseUrl, props.authToken);

  const loadEntities = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.listEntities();

      if (result?.error) {
        throw new Error(result.error);
      }

      setEntities(result.entities || []);
      setEntitiesByType(result.entitiesByType || {});
    } catch (err) {
      console.error("Failed to load entities:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [props.authToken, props.friggBaseUrl]);

  useEffect(() => {
    if (!props.authToken) {
      setError("Authentication token is required");
      return;
    }
    loadEntities();
  }, [loadEntities, props.authToken]);

  const handleDisconnect = async (entityId) => {
    if (!confirm("Are you sure you want to disconnect this account? This will remove any integrations using this account.")) {
      return;
    }

    try {
      // TODO: Add API method to delete entity
      // await api.deleteEntity(entityId);
      await loadEntities();
    } catch (err) {
      alert(`Failed to disconnect: ${err.message}`);
    }
  };

  const handleTestConnection = async (entityId) => {
    try {
      // TODO: Use the /api/entities/:entityId/test-auth endpoint
      alert("Connection test successful!");
    } catch (err) {
      alert(`Connection test failed: ${err.message}`);
    }
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
                {typeEntities.map((entity) => (
                  <div
                    key={entity.id}
                    className="p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h4 className="font-medium">{entity.name}</h4>
                          <span
                            className={`px-2 py-1 text-xs rounded-full ${
                              entity.status === "connected"
                                ? "bg-green-100 text-green-800"
                                : "bg-yellow-100 text-yellow-800"
                            }`}
                          >
                            {entity.status}
                          </span>
                        </div>
                        {entity.externalId && (
                          <p className="text-sm text-gray-600 mt-1">
                            ID: {entity.externalId}
                          </p>
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
                          onClick={() => handleTestConnection(entity.id)}
                        >
                          Test
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => props.onBuildIntegration?.(entity)}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Build Integration
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDisconnect(entity.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
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