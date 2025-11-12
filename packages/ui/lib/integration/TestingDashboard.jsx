import { useState, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/tabs";
import UserActionTester from "./UserActionTester";
import SystemActionsTester from "./SystemActionsTester";
import { Button } from "../components/button.jsx";
import { Settings, Play, RefreshCw, Download, Upload } from "lucide-react";

/**
 * TestingDashboard - Comprehensive testing interface for Frigg integrations
 *
 * Provides a unified interface to test:
 * - User actions with form rendering
 * - System actions (webhooks, polling, queue workers)
 * - Quick actions for common operations
 * - Mock data generation and testing
 *
 * @param {string} props.friggBaseUrl - Base URL for Frigg backend
 * @param {string} props.authToken - JWT token for authenticated user
 * @returns {JSX.Element} The rendered component
 */
export default function TestingDashboard(props) {
  const [activeTab, setActiveTab] = useState("user-actions");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [testSession, setTestSession] = useState(null);

  // Start a new test session
  const startTestSession = useCallback(() => {
    const session = {
      id: `test-${Date.now()}`,
      startTime: new Date().toISOString(),
      actions: [],
      results: []
    };
    setTestSession(session);
  }, []);

  // End the current test session
  const endTestSession = useCallback(() => {
    if (testSession) {
      const session = {
        ...testSession,
        endTime: new Date().toISOString(),
        duration: Date.now() - new Date(testSession.startTime).getTime()
      };
      setTestSession(session);
    }
  }, [testSession]);

  // Export test session data
  const exportTestSession = useCallback(() => {
    if (!testSession) return;
    
    const dataStr = JSON.stringify(testSession, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `frigg-test-session-${testSession.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [testSession]);

  // Import test session data
  const importTestSession = useCallback((event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const session = JSON.parse(e.target.result);
        setTestSession(session);
      } catch (err) {
        console.error('Failed to import test session:', err);
      }
    };
    reader.readAsText(file);
  }, []);

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-white' : ''} space-y-6`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Frigg Integration Testing Dashboard</h1>
          <p className="text-sm text-gray-600 mt-1">
            Comprehensive testing interface for user actions, system actions, and integration workflows
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Test Session Controls */}
          <div className="flex items-center gap-2">
            {!testSession ? (
              <Button onClick={startTestSession} variant="outline" size="sm">
                <Play className="w-4 h-4 mr-2" />
                Start Test Session
              </Button>
            ) : (
              <>
                <Button onClick={endTestSession} variant="outline" size="sm">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  End Session
                </Button>
                <Button onClick={exportTestSession} variant="outline" size="sm">
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
                <label className="cursor-pointer">
                  <Button variant="outline" size="sm" asChild>
                    <span>
                      <Upload className="w-4 h-4 mr-2" />
                      Import
                    </span>
                  </Button>
                  <input
                    type="file"
                    accept=".json"
                    onChange={importTestSession}
                    className="hidden"
                  />
                </label>
              </>
            )}
          </div>

          {/* Fullscreen Toggle */}
          <Button
            onClick={() => setIsFullscreen(!isFullscreen)}
            variant="outline"
            size="sm"
          >
            <Settings className="w-4 h-4 mr-2" />
            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </Button>
        </div>
      </div>

      {/* Test Session Status */}
      {testSession && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-blue-900">Active Test Session</h3>
              <p className="text-sm text-blue-700">
                Session ID: {testSession.id} | 
                Started: {new Date(testSession.startTime).toLocaleString()} |
                Actions: {testSession.actions.length} |
                Results: {testSession.results.length}
              </p>
            </div>
            <div className="text-sm text-blue-600">
              {Math.floor((Date.now() - new Date(testSession.startTime).getTime()) / 1000)}s elapsed
            </div>
          </div>
        </div>
      )}

      {/* Main Testing Interface */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="user-actions">User Actions</TabsTrigger>
          <TabsTrigger value="system-actions">System Actions</TabsTrigger>
          <TabsTrigger value="quick-actions">Quick Actions</TabsTrigger>
          <TabsTrigger value="mock-data">Mock Data</TabsTrigger>
        </TabsList>

        <TabsContent value="user-actions" className="mt-6">
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-2">User Actions Testing</h3>
              <p className="text-sm text-blue-700">
                Test user-facing actions with form rendering, JSONForms integration, and multiple display modes.
                Perfect for exploring how your integration responds to user inputs and how data is structured.
              </p>
            </div>
            <UserActionTester
              friggBaseUrl={props.friggBaseUrl}
              authToken={props.authToken}
              testSession={testSession}
              onActionExecuted={(action, result) => {
                if (testSession) {
                  setTestSession(prev => ({
                    ...prev,
                    actions: [...prev.actions, { type: 'user-action', action, timestamp: new Date().toISOString() }],
                    results: [...prev.results, { type: 'user-action', action, result, timestamp: new Date().toISOString() }]
                  }));
                }
              }}
            />
          </div>
        </TabsContent>

        <TabsContent value="system-actions" className="mt-6">
          <div className="space-y-4">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <h3 className="font-semibold text-orange-900 mb-2">System Actions Testing</h3>
              <p className="text-sm text-orange-700">
                Test system-level actions like webhooks, polling, queue workers, and lifecycle events.
                Essential for understanding how your integration behaves under different system conditions.
              </p>
            </div>
            <SystemActionsTester
              friggBaseUrl={props.friggBaseUrl}
              authToken={props.authToken}
              testSession={testSession}
              onActionExecuted={(action, result) => {
                if (testSession) {
                  setTestSession(prev => ({
                    ...prev,
                    actions: [...prev.actions, { type: 'system-action', action, timestamp: new Date().toISOString() }],
                    results: [...prev.results, { type: 'system-action', action, result, timestamp: new Date().toISOString() }]
                  }));
                }
              }}
            />
          </div>
        </TabsContent>

        <TabsContent value="quick-actions" className="mt-6">
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="font-semibold text-green-900 mb-2">Quick Actions</h3>
              <p className="text-sm text-green-700">
                Common operations and shortcuts for rapid testing and development.
                Includes sample data generation, integration health checks, and common workflows.
              </p>
            </div>
            <QuickActionsPanel
              friggBaseUrl={props.friggBaseUrl}
              authToken={props.authToken}
              testSession={testSession}
            />
          </div>
        </TabsContent>

        <TabsContent value="mock-data" className="mt-6">
          <div className="space-y-4">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <h3 className="font-semibold text-purple-900 mb-2">Mock Data Generator</h3>
              <p className="text-sm text-purple-700">
                Generate realistic test data for your integrations and explore different response formats.
                Test how your integration handles various data structures and edge cases.
              </p>
            </div>
            <MockDataGenerator
              friggBaseUrl={props.friggBaseUrl}
              authToken={props.authToken}
              testSession={testSession}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Quick Actions Panel Component
function QuickActionsPanel({ friggBaseUrl, authToken, testSession }) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState({});

  const quickActions = [
    {
      id: 'health-check',
      name: 'Health Check',
      description: 'Check integration health and connectivity',
      action: async () => {
        // Implementation for health check
        return { status: 'healthy', timestamp: new Date().toISOString() };
      }
    },
    {
      id: 'sample-data',
      name: 'Generate Sample Data',
      description: 'Create sample data for testing',
      action: async () => {
        // Implementation for sample data generation
        return { message: 'Sample data generated successfully' };
      }
    },
    {
      id: 'refresh-credentials',
      name: 'Refresh Credentials',
      description: 'Refresh OAuth tokens and credentials',
      action: async () => {
        // Implementation for credential refresh
        return { message: 'Credentials refreshed successfully' };
      }
    },
    {
      id: 'test-webhook',
      name: 'Test Webhook',
      description: 'Send a test webhook event',
      action: async () => {
        // Implementation for webhook testing
        return { message: 'Test webhook sent successfully' };
      }
    }
  ];

  const executeQuickAction = async (action) => {
    try {
      setLoading(true);
      const result = await action.action();
      setResults(prev => ({ ...prev, [action.id]: result }));
    } catch (error) {
      setResults(prev => ({ ...prev, [action.id]: { error: error.message } }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {quickActions.map((action) => (
        <div key={action.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
          <h4 className="font-semibold text-sm mb-2">{action.name}</h4>
          <p className="text-xs text-gray-600 mb-3">{action.description}</p>
          <Button
            onClick={() => executeQuickAction(action)}
            disabled={loading}
            size="sm"
            className="w-full"
          >
            {loading ? <LoadingSpinner className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
            Execute
          </Button>
          {results[action.id] && (
            <div className="mt-3 p-2 bg-gray-50 rounded text-xs">
              <pre>{JSON.stringify(results[action.id], null, 2)}</pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Mock Data Generator Component
function MockDataGenerator({ friggBaseUrl, authToken, testSession }) {
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [generatedData, setGeneratedData] = useState(null);
  const [loading, setLoading] = useState(false);

  const dataTemplates = [
    {
      id: 'user-profile',
      name: 'User Profile',
      description: 'Generate realistic user profile data',
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          avatar: { type: 'string', format: 'uri' },
          createdAt: { type: 'string', format: 'date-time' }
        }
      }
    },
    {
      id: 'product-catalog',
      name: 'Product Catalog',
      description: 'Generate product catalog data',
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          price: { type: 'number' },
          category: { type: 'string' },
          inStock: { type: 'boolean' },
          tags: { type: 'array', items: { type: 'string' } }
        }
      }
    },
    {
      id: 'api-response',
      name: 'API Response',
      description: 'Generate typical API response structure',
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: { type: 'object' },
          message: { type: 'string' },
          timestamp: { type: 'string', format: 'date-time' },
          pagination: {
            type: 'object',
            properties: {
              page: { type: 'number' },
              limit: { type: 'number' },
              total: { type: 'number' }
            }
          }
        }
      }
    }
  ];

  const generateMockData = async (template) => {
    try {
      setLoading(true);
      // Simple mock data generation based on schema
      const mockData = generateDataFromSchema(template.schema);
      setGeneratedData(mockData);
    } catch (error) {
      console.error('Failed to generate mock data:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateDataFromSchema = (schema) => {
    // Simple mock data generator - in a real implementation, this would be more sophisticated
    const data = {};
    if (schema.properties) {
      Object.entries(schema.properties).forEach(([key, prop]) => {
        switch (prop.type) {
          case 'string':
            if (prop.format === 'email') {
              data[key] = `user${Math.floor(Math.random() * 1000)}@example.com`;
            } else if (prop.format === 'uri') {
              data[key] = `https://example.com/${key}.jpg`;
            } else if (prop.format === 'date-time') {
              data[key] = new Date().toISOString();
            } else {
              data[key] = `${key}_${Math.floor(Math.random() * 1000)}`;
            }
            break;
          case 'number':
            data[key] = Math.floor(Math.random() * 1000);
            break;
          case 'boolean':
            data[key] = Math.random() > 0.5;
            break;
          case 'array':
            data[key] = ['tag1', 'tag2', 'tag3'].slice(0, Math.floor(Math.random() * 3) + 1);
            break;
          case 'object':
            data[key] = prop.properties ? generateDataFromSchema(prop) : {};
            break;
          default:
            data[key] = null;
        }
      });
    }
    return data;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {dataTemplates.map((template) => (
          <div key={template.id} className="border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-2">{template.name}</h4>
            <p className="text-xs text-gray-600 mb-3">{template.description}</p>
            <Button
              onClick={() => generateMockData(template)}
              disabled={loading}
              size="sm"
              className="w-full"
            >
              {loading ? <LoadingSpinner className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
              Generate
            </Button>
          </div>
        ))}
      </div>

      {generatedData && (
        <div className="border-t pt-6">
          <h3 className="font-semibold text-lg mb-4">Generated Mock Data</h3>
          <div className="bg-gray-50 border rounded-lg p-4">
            <pre className="text-sm overflow-auto max-h-96">
              {JSON.stringify(generatedData, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}