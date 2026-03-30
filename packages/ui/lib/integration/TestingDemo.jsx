import { useState } from "react";
import { TestingDashboard, UserActionTester, SystemActionsTester } from "./index";
import { Button } from "../components/button.jsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/tabs.jsx";

/**
 * TestingDemo - Demo page showcasing the Frigg testing components
 *
 * This component demonstrates how to use the various testing tools
 * for local development and integration testing.
 */
export default function TestingDemo() {
  const [authToken, setAuthToken] = useState('');
  const [friggBaseUrl, setFriggBaseUrl] = useState('http://localhost:3000');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Mock authentication for demo purposes
  const handleLogin = () => {
    if (authToken.trim()) {
      setIsAuthenticated(true);
    } else {
      // For demo purposes, use a mock token
      setAuthToken('demo-token-123');
      setIsAuthenticated(true);
    }
  };

  const handleLogout = () => {
    setAuthToken('');
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            Frigg Testing Demo
          </h1>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Frigg Base URL
              </label>
              <input
                type="url"
                value={friggBaseUrl}
                onChange={(e) => setFriggBaseUrl(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="http://localhost:3000"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Auth Token (optional for demo)
              </label>
              <input
                type="text"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Leave empty for demo mode"
              />
            </div>
            
            <Button onClick={handleLogin} className="w-full">
              Start Testing Demo
            </Button>
          </div>
          
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h3 className="font-semibold text-blue-900 mb-2">Demo Features</h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• User Actions Testing with JSONForms</li>
              <li>• System Actions (Webhooks, Polling, Queue Workers)</li>
              <li>• Quick Actions Panel</li>
              <li>• Mock Data Generator</li>
              <li>• Test Session Management</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Frigg Testing Demo</h1>
            <p className="text-sm text-gray-600">
              Testing URL: {friggBaseUrl} | 
              {authToken ? ` Token: ${authToken.substring(0, 10)}...` : ' Demo Mode'}
            </p>
          </div>
          <Button onClick={handleLogout} variant="outline">
            Logout
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6">
        <Tabs defaultValue="dashboard" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="dashboard">Full Dashboard</TabsTrigger>
            <TabsTrigger value="user-actions">User Actions Only</TabsTrigger>
            <TabsTrigger value="system-actions">System Actions Only</TabsTrigger>
            <TabsTrigger value="about">About</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-6">
            <TestingDashboard
              friggBaseUrl={friggBaseUrl}
              authToken={authToken}
            />
          </TabsContent>

          <TabsContent value="user-actions" className="mt-6">
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2">User Actions Tester</h3>
                <p className="text-sm text-blue-700">
                  Test user-facing actions with form rendering and JSONForms integration.
                </p>
              </div>
              <UserActionTester
                friggBaseUrl={friggBaseUrl}
                authToken={authToken}
              />
            </div>
          </TabsContent>

          <TabsContent value="system-actions" className="mt-6">
            <div className="space-y-4">
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <h3 className="font-semibold text-orange-900 mb-2">System Actions Tester</h3>
                <p className="text-sm text-orange-700">
                  Test system-level actions like webhooks, polling, and queue workers.
                </p>
              </div>
              <SystemActionsTester
                friggBaseUrl={friggBaseUrl}
                authToken={authToken}
              />
            </div>
          </TabsContent>

          <TabsContent value="about" className="mt-6">
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Frigg UI Library Testing Components</h2>
                
                <div className="prose max-w-none">
                  <p className="text-gray-600 mb-6">
                    The Frigg UI Library provides comprehensive testing tools for developers working with integrations.
                    These components help you understand how your integrations behave under different conditions and
                    explore the data structures returned by various API calls.
                  </p>

                  <h3 className="text-xl font-semibold text-gray-900 mb-3">Available Components</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div className="border border-gray-200 rounded-lg p-4">
                      <h4 className="font-semibold text-blue-900 mb-2">UserActionTester</h4>
                      <p className="text-sm text-gray-600 mb-3">
                        Test user-facing actions with form rendering, JSONForms integration, and multiple display modes.
                      </p>
                      <ul className="text-xs text-gray-500 space-y-1">
                        <li>• Form-based input with JSONForms</li>
                        <li>• JSON, Card, Table, and Form display modes</li>
                        <li>• Real-time form validation</li>
                        <li>• Integration with existing Form component</li>
                      </ul>
                    </div>

                    <div className="border border-gray-200 rounded-lg p-4">
                      <h4 className="font-semibold text-orange-900 mb-2">SystemActionsTester</h4>
                      <p className="text-sm text-gray-600 mb-3">
                        Test system-level actions like webhooks, polling, queue workers, and lifecycle events.
                      </p>
                      <ul className="text-xs text-gray-500 space-y-1">
                        <li>• Webhook event simulation</li>
                        <li>• Polling process control</li>
                        <li>• Queue worker execution</li>
                        <li>• Lifecycle event triggering</li>
                      </ul>
                    </div>

                    <div className="border border-gray-200 rounded-lg p-4">
                      <h4 className="font-semibold text-green-900 mb-2">TestingDashboard</h4>
                      <p className="text-sm text-gray-600 mb-3">
                        Unified interface combining all testing tools with session management and data export.
                      </p>
                      <ul className="text-xs text-gray-500 space-y-1">
                        <li>• Tabbed interface for different test types</li>
                        <li>• Test session management</li>
                        <li>• Data export/import functionality</li>
                        <li>• Quick actions panel</li>
                      </ul>
                    </div>

                    <div className="border border-gray-200 rounded-lg p-4">
                      <h4 className="font-semibold text-purple-900 mb-2">Mock Data Generator</h4>
                      <p className="text-sm text-gray-600 mb-3">
                        Generate realistic test data for your integrations and explore different response formats.
                      </p>
                      <ul className="text-xs text-gray-500 space-y-1">
                        <li>• Schema-based data generation</li>
                        <li>• Multiple data templates</li>
                        <li>• Realistic test data creation</li>
                        <li>• API response simulation</li>
                      </ul>
                    </div>
                  </div>

                  <h3 className="text-xl font-semibold text-gray-900 mb-3">Usage Examples</h3>
                  
                  <div className="bg-gray-50 rounded-lg p-4 mb-6">
                    <h4 className="font-semibold text-gray-900 mb-2">Basic Usage</h4>
                    <pre className="text-sm text-gray-700 overflow-x-auto">
{`import { TestingDashboard } from '@friggframework/ui';

function MyApp() {
  return (
    <TestingDashboard
      friggBaseUrl="http://localhost:3000"
      authToken="your-jwt-token"
    />
  );
}`}
                    </pre>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4 mb-6">
                    <h4 className="font-semibold text-gray-900 mb-2">Individual Components</h4>
                    <pre className="text-sm text-gray-700 overflow-x-auto">
{`import { 
  UserActionTester, 
  SystemActionsTester 
} from '@friggframework/ui';

function CustomTestingPage() {
  return (
    <div>
      <UserActionTester
        friggBaseUrl="http://localhost:3000"
        authToken="your-jwt-token"
      />
      <SystemActionsTester
        friggBaseUrl="http://localhost:3000"
        authToken="your-jwt-token"
      />
    </div>
  );
}`}
                    </pre>
                  </div>

                  <h3 className="text-xl font-semibold text-gray-900 mb-3">API Endpoints</h3>
                  
                  <div className="space-y-3">
                    <div className="bg-white border border-gray-200 rounded p-3">
                      <code className="text-sm font-mono text-blue-600">GET /api/integrations/{id}/system-actions</code>
                      <p className="text-xs text-gray-600 mt-1">Get available system actions for an integration</p>
                    </div>
                    <div className="bg-white border border-gray-200 rounded p-3">
                      <code className="text-sm font-mono text-blue-600">POST /api/integrations/{id}/system-actions/{type}</code>
                      <p className="text-xs text-gray-600 mt-1">Execute a system action (webhook, polling, etc.)</p>
                    </div>
                    <div className="bg-white border border-gray-200 rounded p-3">
                      <code className="text-sm font-mono text-blue-600">POST /api/integrations/{id}/webhooks/trigger</code>
                      <p className="text-xs text-gray-600 mt-1">Trigger a webhook event</p>
                    </div>
                    <div className="bg-white border border-gray-200 rounded p-3">
                      <code className="text-sm font-mono text-blue-600">POST /api/integrations/{id}/polling</code>
                      <p className="text-xs text-gray-600 mt-1">Start/stop polling for an integration</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}