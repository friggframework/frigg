import { useEffect, useState, useCallback } from "react";
import API from "../api/api";
import { Button } from "../components/button.jsx";
import { LoadingSpinner } from "../components/LoadingSpinner.jsx";
import { ChevronRight, Play, RefreshCw } from "lucide-react";

/**
 * UserActionTester - Dev mode component for testing integration user actions
 *
 * Provides a UI to:
 * - Select an installed integration
 * - View available user actions for that integration
 * - Execute actions with custom inputs
 * - Display results in various formats (JSON, cards, tables)
 *
 * @param {string} props.friggBaseUrl - Base URL for Frigg backend
 * @param {string} props.authToken - JWT token for authenticated user
 * @returns {JSX.Element} The rendered component
 */
export default function UserActionTester(props) {
  const [integrations, setIntegrations] = useState([]);
  const [selectedIntegration, setSelectedIntegration] = useState(null);
  const [actions, setActions] = useState([]);
  const [selectedAction, setSelectedAction] = useState(null);
  const [actionOptions, setActionOptions] = useState(null);
  const [inputData, setInputData] = useState({});
  const [result, setResult] = useState(null);
  const [displayMode, setDisplayMode] = useState('json'); // 'json', 'card', 'table'
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState(null);

  const api = new API(props.friggBaseUrl, props.authToken);

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

  // Load actions for selected integration
  const loadActions = useCallback(async (integrationId) => {
    try {
      setLoading(true);
      setError(null);
      setActions([]);
      setSelectedAction(null);
      setActionOptions(null);
      setResult(null);

      const result = await api.getUserActions(integrationId, null);

      if (result?.error) {
        throw new Error(result.error);
      }

      setActions(result.actions || []);
    } catch (err) {
      console.error("Failed to load actions:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  // Load options/form for selected action
  const loadActionOptions = useCallback(async (integrationId, actionId) => {
    try {
      setLoading(true);
      setError(null);
      setActionOptions(null);
      setInputData({});

      const result = await api.getUserActionOptions(integrationId, actionId, {});

      if (result?.error) {
        throw new Error(result.error);
      }

      setActionOptions(result);
    } catch (err) {
      console.error("Failed to load action options:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  // Execute the selected action
  const executeAction = useCallback(async () => {
    if (!selectedIntegration || !selectedAction) return;

    try {
      setExecuting(true);
      setError(null);
      setResult(null);

      const result = await api.submitUserAction(
        selectedIntegration.id,
        selectedAction,
        inputData
      );

      setResult(result);
    } catch (err) {
      console.error("Failed to execute action:", err);
      setError(err.message);
    } finally {
      setExecuting(false);
    }
  }, [selectedIntegration, selectedAction, inputData, api]);

  // Handle integration selection
  const handleSelectIntegration = useCallback((integration) => {
    setSelectedIntegration(integration);
    loadActions(integration.id);
  }, [loadActions]);

  // Handle action selection
  const handleSelectAction = useCallback((actionId) => {
    setSelectedAction(actionId);
    loadActionOptions(selectedIntegration.id, actionId);
  }, [selectedIntegration, loadActionOptions]);

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
            <h4 className="font-semibold text-lg mb-4">Result</h4>
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
        // For array results, display as table
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
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-blue-800">
        <h3 className="font-semibold mb-1">🧪 User Action Tester (Dev Mode)</h3>
        <p className="text-sm">
          Test and explore user actions configured in your integrations.
          This tool helps you understand what data is returned and how to use it in your application.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: Integration Selection */}
        <div className="space-y-3">
          <h3 className="font-semibold text-lg">1. Select Integration</h3>
          {integrations.length === 0 ? (
            <p className="text-sm text-gray-600">
              No integrations installed. Create an integration to test user actions.
            </p>
          ) : (
            <div className="space-y-2">
              {integrations.map((integration) => (
                <button
                  key={integration.id}
                  onClick={() => handleSelectIntegration(integration)}
                  className={`w-full text-left p-3 border rounded-lg transition-colors ${
                    selectedIntegration?.id === integration.id
                      ? 'border-blue-500 bg-blue-50'
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
          <h3 className="font-semibold text-lg">2. Select Action</h3>
          {!selectedIntegration ? (
            <p className="text-sm text-gray-600">Select an integration first</p>
          ) : loading ? (
            <LoadingSpinner />
          ) : actions.length === 0 ? (
            <p className="text-sm text-gray-600">No user actions available</p>
          ) : (
            <div className="space-y-2">
              {actions.map((action) => (
                <button
                  key={action.id || action.name}
                  onClick={() => handleSelectAction(action.id || action.name)}
                  className={`w-full text-left p-3 border rounded-lg transition-colors ${
                    selectedAction === (action.id || action.name)
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <div className="font-medium text-sm">
                    {action.name || action.id}
                  </div>
                  {action.description && (
                    <div className="text-xs text-gray-600 mt-1">
                      {action.description}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Column 3: Input & Execute */}
        <div className="space-y-3">
          <h3 className="font-semibold text-lg">3. Execute</h3>
          {!selectedAction ? (
            <p className="text-sm text-gray-600">Select an action first</p>
          ) : (
            <div className="space-y-4">
              {/* Input Form - Basic JSON editor for now */}
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
                  rows={6}
                  placeholder="{}"
                />
              </div>

              {/* Execute Button */}
              <Button
                onClick={executeAction}
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
                    Execute Action
                  </>
                )}
              </Button>

              {/* Action Options Info */}
              {actionOptions && (
                <div className="text-xs text-gray-600 bg-gray-50 rounded p-2">
                  <div className="font-medium mb-1">Available Options:</div>
                  <pre className="overflow-auto">
                    {JSON.stringify(actionOptions, null, 2)}
                  </pre>
                </div>
              )}
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
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                JSON
              </button>
              <button
                onClick={() => setDisplayMode('card')}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  displayMode === 'card'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Card
              </button>
              <button
                onClick={() => setDisplayMode('table')}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  displayMode === 'table'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Table
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
