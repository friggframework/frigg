import { useEffect, useState, useCallback } from "react";
import API from "../api/api";
import { Button } from "../components/button.jsx";
import { LoadingSpinner } from "../components/LoadingSpinner.jsx";
import { ChevronRight, Play, RefreshCw, Webhook, Clock, Database, Zap } from "lucide-react";

/**
 * SystemActionsTester - Dev mode component for testing system-level actions
 *
 * Provides a UI to:
 * - Trigger webhook events
 * - Start/stop polling processes
 * - Execute queue workers
 * - Test system events and lifecycle hooks
 * - Monitor system action results
 *
 * @param {string} props.friggBaseUrl - Base URL for Frigg backend
 * @param {string} props.authToken - JWT token for authenticated user
 * @returns {JSX.Element} The rendered component
 */
export default function SystemActionsTester(props) {
  const [integrations, setIntegrations] = useState([]);
  const [selectedIntegration, setSelectedIntegration] = useState(null);
  const [systemActions, setSystemActions] = useState([]);
  const [selectedAction, setSelectedAction] = useState(null);
  const [actionConfig, setActionConfig] = useState({});
  const [inputData, setInputData] = useState({});
  const [result, setResult] = useState(null);
  const [displayMode, setDisplayMode] = useState('json'); // 'json', 'card', 'table', 'logs'
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState(null);
  const [logs, setLogs] = useState([]);

  const api = new API(props.friggBaseUrl, props.authToken);

  // System action types with their configurations
  const systemActionTypes = {
    webhook: {
      name: 'Webhook Trigger',
      description: 'Simulate incoming webhook events',
      icon: Webhook,
      color: 'blue',
      defaultConfig: {
        eventType: 'data.updated',
        payload: {},
        headers: {},
        queryParams: {}
      }
    },
    polling: {
      name: 'Polling Process',
      description: 'Start/stop polling for data changes',
      icon: Clock,
      color: 'green',
      defaultConfig: {
        interval: 30000,
        enabled: true,
        filters: {}
      }
    },
    queueWorker: {
      name: 'Queue Worker',
      description: 'Execute background queue jobs',
      icon: Database,
      color: 'purple',
      defaultConfig: {
        jobType: 'sync_data',
        priority: 'normal',
        retryCount: 3
      }
    },
    lifecycleEvent: {
      name: 'Lifecycle Event',
      description: 'Trigger integration lifecycle events',
      icon: Zap,
      color: 'orange',
      defaultConfig: {
        event: 'ON_CREATE',
        data: {}
      }
    }
  };

  // Load installed integrations
  const loadIntegrations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.listIntegrations();

      if (result?.error) {
        throw new Error(result.error);
      }

      setIntegrations(result.integrations || []);
    } catch (err) {
      console.error("Failed to load integrations:", err);
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
    loadIntegrations();
  }, [loadIntegrations, props.authToken]);

  // Load system actions for selected integration
  const loadSystemActions = useCallback(async (integrationId) => {
    try {
      setLoading(true);
      setError(null);
      setSystemActions([]);
      setSelectedAction(null);
      setResult(null);

      // Get available system actions for this integration
      const result = await api.getSystemActions(integrationId);

      if (result?.error) {
        throw new Error(result.error);
      }

      // If no system actions returned, provide default ones
      const defaultActions = Object.entries(systemActionTypes).map(([key, config]) => ({
        id: key,
        name: config.name,
        description: config.description,
        type: key,
        icon: config.icon,
        color: config.color,
        config: config.defaultConfig
      }));

      setSystemActions(result.actions || defaultActions);
    } catch (err) {
      console.error("Failed to load system actions:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  // Execute the selected system action
  const executeSystemAction = useCallback(async () => {
    if (!selectedIntegration || !selectedAction) return;

    try {
      setExecuting(true);
      setError(null);
      setResult(null);
      setLogs(prev => [...prev, {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `Executing ${selectedAction.name}...`
      }]);

      const result = await api.executeSystemAction(
        selectedIntegration.id,
        selectedAction.type,
        {
          ...actionConfig,
          inputData
        }
      );

      setResult(result);
      setLogs(prev => [...prev, {
        timestamp: new Date().toISOString(),
        level: 'success',
        message: `System action completed successfully`
      }]);
    } catch (err) {
      console.error("Failed to execute system action:", err);
      setError(err.message);
      setLogs(prev => [...prev, {
        timestamp: new Date().toISOString(),
        level: 'error',
        message: `System action failed: ${err.message}`
      }]);
    } finally {
      setExecuting(false);
    }
  }, [selectedIntegration, selectedAction, actionConfig, inputData, api]);

  // Handle integration selection
  const handleSelectIntegration = useCallback((integration) => {
    setSelectedIntegration(integration);
    loadSystemActions(integration.id);
  }, [loadSystemActions]);

  // Handle action selection
  const handleSelectAction = useCallback((action) => {
    setSelectedAction(action);
    setActionConfig(action.config || {});
    setInputData({});
  }, []);

  // Update action configuration
  const updateActionConfig = useCallback((key, value) => {
    setActionConfig(prev => ({
      ...prev,
      [key]: value
    }));
  }, []);

  // Update input data
  const updateInputData = useCallback((key, value) => {
    setInputData(prev => ({
      ...prev,
      [key]: value
    }));
  }, []);

  // Render configuration form based on action type
  const renderActionConfig = () => {
    if (!selectedAction) return null;

    const actionType = systemActionTypes[selectedAction.type];
    if (!actionType) return null;

    switch (selectedAction.type) {
      case 'webhook':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Event Type</label>
              <input
                type="text"
                value={actionConfig.eventType || ''}
                onChange={(e) => updateActionConfig('eventType', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                placeholder="e.g., data.updated, user.created"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Payload (JSON)</label>
              <textarea
                value={JSON.stringify(actionConfig.payload || {}, null, 2)}
                onChange={(e) => {
                  try {
                    updateActionConfig('payload', JSON.parse(e.target.value || '{}'));
                  } catch (err) {
                    // Invalid JSON, ignore
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                rows={4}
                placeholder="{}"
              />
            </div>
          </div>
        );

      case 'polling':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Interval (ms)</label>
              <input
                type="number"
                value={actionConfig.interval || 30000}
                onChange={(e) => updateActionConfig('interval', parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                min="1000"
                step="1000"
              />
            </div>
            <div className="flex items-center">
              <input
                type="checkbox"
                id="enabled"
                checked={actionConfig.enabled || false}
                onChange={(e) => updateActionConfig('enabled', e.target.checked)}
                className="mr-2"
              />
              <label htmlFor="enabled" className="text-sm font-medium">Enabled</label>
            </div>
          </div>
        );

      case 'queueWorker':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Job Type</label>
              <select
                value={actionConfig.jobType || 'sync_data'}
                onChange={(e) => updateActionConfig('jobType', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="sync_data">Sync Data</option>
                <option value="process_webhook">Process Webhook</option>
                <option value="cleanup">Cleanup</option>
                <option value="backup">Backup</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Priority</label>
              <select
                value={actionConfig.priority || 'normal'}
                onChange={(e) => updateActionConfig('priority', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
        );

      case 'lifecycleEvent':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Event</label>
              <select
                value={actionConfig.event || 'ON_CREATE'}
                onChange={(e) => updateActionConfig('event', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="ON_CREATE">On Create</option>
                <option value="ON_UPDATE">On Update</option>
                <option value="ON_DELETE">On Delete</option>
                <option value="GET_CONFIG_OPTIONS">Get Config Options</option>
                <option value="REFRESH_CONFIG_OPTIONS">Refresh Config Options</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Event Data (JSON)</label>
              <textarea
                value={JSON.stringify(actionConfig.data || {}, null, 2)}
                onChange={(e) => {
                  try {
                    updateActionConfig('data', JSON.parse(e.target.value || '{}'));
                  } catch (err) {
                    // Invalid JSON, ignore
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                rows={4}
                placeholder="{}"
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // Render result based on display mode
  const renderResult = () => {
    if (!result) return null;

    switch (displayMode) {
      case 'json':
        return (
          <pre className="bg-gray-50 border rounded-lg p-4 overflow-auto max-h-96 text-sm">
            {JSON.stringify(result, null, 2)}
          </pre>
        );

      case 'card':
        return (
          <div className="bg-white border rounded-lg p-6 shadow-sm">
            <h4 className="font-semibold text-lg mb-4">System Action Result</h4>
            {Object.entries(result).map(([key, value]) => (
              <div key={key} className="mb-3 pb-3 border-b last:border-b-0">
                <div className="text-sm font-medium text-gray-600 mb-1">
                  {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </div>
                <div className="text-sm text-gray-900">
                  {typeof value === 'object'
                    ? JSON.stringify(value, null, 2)
                    : String(value)}
                </div>
              </div>
            ))}
          </div>
        );

      case 'table':
        const data = Array.isArray(result) ? result : [result];
        if (data.length === 0) return <p className="text-gray-500">No data</p>;

        const keys = Object.keys(data[0]);
        return (
          <div className="overflow-auto">
            <table className="min-w-full border-collapse border border-gray-300">
              <thead className="bg-gray-100">
                <tr>
                  {keys.map(key => (
                    <th key={key} className="border border-gray-300 px-4 py-2 text-left text-sm font-medium">
                      {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, idx) => (
                  <tr key={idx} className="even:bg-gray-50">
                    {keys.map(key => (
                      <td key={key} className="border border-gray-300 px-4 py-2 text-sm">
                        {typeof row[key] === 'object'
                          ? JSON.stringify(row[key])
                          : String(row[key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      case 'logs':
        return (
          <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-auto max-h-96">
            {logs.map((log, idx) => (
              <div key={idx} className={`mb-1 ${
                log.level === 'error' ? 'text-red-400' :
                log.level === 'success' ? 'text-green-400' :
                'text-blue-400'
              }`}>
                <span className="text-gray-500">[{log.timestamp}]</span> {log.message}
              </div>
            ))}
          </div>
        );

      default:
        return null;
    }
  };

  if (loading && integrations.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner />
        <span className="ml-3">Loading integrations...</span>
      </div>
    );
  }

  if (error && integrations.length === 0) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
        <h3 className="font-semibold mb-2">Error</h3>
        <p>{error}</p>
        <Button onClick={loadIntegrations} className="mt-3">
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-orange-800">
        <h3 className="font-semibold mb-1">⚡ System Actions Tester (Dev Mode)</h3>
        <p className="text-sm">
          Test system-level actions like webhooks, polling, and queue workers.
          This tool helps you understand how your integration responds to system events.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: Integration Selection */}
        <div className="space-y-3">
          <h3 className="font-semibold text-lg">1. Select Integration</h3>
          {integrations.length === 0 ? (
            <p className="text-sm text-gray-600">
              No integrations installed. Create an integration to test system actions.
            </p>
          ) : (
            <div className="space-y-2">
              {integrations.map((integration) => (
                <button
                  key={integration.id}
                  onClick={() => handleSelectIntegration(integration)}
                  className={`w-full text-left p-3 border rounded-lg transition-colors ${
                    selectedIntegration?.id === integration.id
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <div className="font-medium text-sm">{integration.type}</div>
                  <div className="text-xs text-gray-600 mt-1">
                    {integration.entities?.length || 0} entities
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Column 2: Action Selection */}
        <div className="space-y-3">
          <h3 className="font-semibold text-lg">2. Select System Action</h3>
          {!selectedIntegration ? (
            <p className="text-sm text-gray-600">Select an integration first</p>
          ) : loading ? (
            <LoadingSpinner />
          ) : systemActions.length === 0 ? (
            <p className="text-sm text-gray-600">No system actions available</p>
          ) : (
            <div className="space-y-2">
              {systemActions.map((action) => {
                const IconComponent = action.icon;
                return (
                  <button
                    key={action.id}
                    onClick={() => handleSelectAction(action)}
                    className={`w-full text-left p-3 border rounded-lg transition-colors ${
                      selectedAction?.id === action.id
                        ? 'border-orange-500 bg-orange-50'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <div className="flex items-center">
                      <IconComponent className={`w-4 h-4 mr-2 text-${action.color}-600`} />
                      <div className="font-medium text-sm">{action.name}</div>
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      {action.description}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Column 3: Configuration & Execute */}
        <div className="space-y-3">
          <h3 className="font-semibold text-lg">3. Configure & Execute</h3>
          {!selectedAction ? (
            <p className="text-sm text-gray-600">Select a system action first</p>
          ) : (
            <div className="space-y-4">
              {/* Action Configuration */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Configuration
                </label>
                {renderActionConfig()}
              </div>

              {/* Input Data */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Input Data (JSON)
                </label>
                <textarea
                  value={JSON.stringify(inputData, null, 2)}
                  onChange={(e) => {
                    try {
                      setInputData(JSON.parse(e.target.value || '{}'));
                    } catch (err) {
                      // Invalid JSON, ignore
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                  rows={4}
                  placeholder="{}"
                />
              </div>

              {/* Execute Button */}
              <Button
                onClick={executeSystemAction}
                disabled={executing}
                className="w-full"
              >
                {executing ? (
                  <>
                    <LoadingSpinner className="w-4 h-4 mr-2" />
                    Executing...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Execute System Action
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Results Section */}
      {result && (
        <div className="border-t pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">Result</h3>

            {/* Display Mode Toggle */}
            <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setDisplayMode('json')}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  displayMode === 'json'
                    ? 'bg-white text-orange-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                JSON
              </button>
              <button
                onClick={() => setDisplayMode('card')}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  displayMode === 'card'
                    ? 'bg-white text-orange-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Card
              </button>
              <button
                onClick={() => setDisplayMode('table')}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  displayMode === 'table'
                    ? 'bg-white text-orange-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Table
              </button>
              <button
                onClick={() => setDisplayMode('logs')}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  displayMode === 'logs'
                    ? 'bg-white text-orange-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Logs
              </button>
            </div>
          </div>

          {renderResult()}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
          <p className="text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}