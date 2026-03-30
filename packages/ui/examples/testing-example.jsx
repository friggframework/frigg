import React, { useState } from 'react';
import { 
  TestingDashboard, 
  UserActionTester, 
  SystemActionsTester,
  TestingDemo 
} from '../lib/integration';
import { Button } from '../lib/components/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../lib/components/tabs';

/**
 * Example application demonstrating how to use the Frigg testing components
 * in a real application for local development and integration testing.
 */
function TestingExampleApp() {
  const [authToken, setAuthToken] = useState('');
  const [friggBaseUrl, setFriggBaseUrl] = useState('http://localhost:3000');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeView, setActiveView] = useState('demo');

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
            Frigg Testing Example
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
              Start Testing
            </Button>
          </div>
          
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h3 className="font-semibold text-blue-900 mb-2">Available Views</h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• <strong>Demo:</strong> Complete testing interface with all components</li>
              <li>• <strong>Dashboard:</strong> Unified testing dashboard</li>
              <li>• <strong>Individual:</strong> Separate user and system action testers</li>
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
            <h1 className="text-xl font-semibold text-gray-900">Frigg Testing Example</h1>
            <p className="text-sm text-gray-600">
              Testing URL: {friggBaseUrl} | 
              {authToken ? ` Token: ${authToken.substring(0, 10)}...` : ' Demo Mode'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setActiveView('demo')}
                variant={activeView === 'demo' ? 'default' : 'outline'}
                size="sm"
              >
                Demo
              </Button>
              <Button
                onClick={() => setActiveView('dashboard')}
                variant={activeView === 'dashboard' ? 'default' : 'outline'}
                size="sm"
              >
                Dashboard
              </Button>
              <Button
                onClick={() => setActiveView('individual')}
                variant={activeView === 'individual' ? 'default' : 'outline'}
                size="sm"
              >
                Individual
              </Button>
            </div>
            <Button onClick={handleLogout} variant="outline">
              Logout
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6">
        {activeView === 'demo' && (
          <TestingDemo />
        )}

        {activeView === 'dashboard' && (
          <TestingDashboard
            friggBaseUrl={friggBaseUrl}
            authToken={authToken}
          />
        )}

        {activeView === 'individual' && (
          <Tabs defaultValue="user-actions" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="user-actions">User Actions</TabsTrigger>
              <TabsTrigger value="system-actions">System Actions</TabsTrigger>
            </TabsList>

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
          </Tabs>
        )}
      </div>
    </div>
  );
}

export default TestingExampleApp;