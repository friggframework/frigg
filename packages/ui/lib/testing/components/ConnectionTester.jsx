import React, { useState } from 'react';
import { Button } from '../../components/button';
import { Input } from '../../components/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/table';
import { useToast } from '../../components/use-toast';
import { dummyUserManager } from '../models/DummyUser';

export const ConnectionTester = ({ integrations = [], apiUrl, onTestComplete }) => {
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedIntegration, setSelectedIntegration] = useState('');
  const [testEndpoint, setTestEndpoint] = useState('');
  const [testResults, setTestResults] = useState([]);
  const [isTestRunning, setIsTestRunning] = useState(false);
  const { toast } = useToast();

  const users = dummyUserManager.readAll();

  const runConnectionTest = async () => {
    if (!selectedUser || !selectedIntegration) {
      toast({
        title: 'Missing Information',
        description: 'Please select a user and integration',
        variant: 'destructive'
      });
      return;
    }

    setIsTestRunning(true);
    const user = dummyUserManager.read(selectedUser);
    const integration = integrations.find(i => i.name === selectedIntegration);
    const userIntegration = user.integrations[selectedIntegration];

    const result = {
      user: user.name,
      integration: selectedIntegration,
      endpoint: testEndpoint || 'default',
      timestamp: new Date()
    };

    try {
      // Simulate API connection test
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (!userIntegration) {
        throw new Error('User does not have this integration connected');
      }

      // Simulate different test scenarios
      const random = Math.random();
      if (random > 0.8) {
        throw new Error('Connection timeout');
      } else if (random > 0.7) {
        throw new Error('Invalid credentials');
      }

      result.success = true;
      result.responseTime = Math.floor(Math.random() * 500) + 100;
      result.status = 200;
      result.message = 'Connection successful';
      result.data = {
        authenticated: true,
        scopes: integration.config?.scopes || [],
        rateLimit: {
          remaining: Math.floor(Math.random() * 5000),
          total: 5000
        }
      };
    } catch (error) {
      result.success = false;
      result.status = error.message.includes('timeout') ? 408 : 401;
      result.message = error.message;
      result.error = error.message;
    }

    setTestResults(prev => [result, ...prev].slice(0, 10));
    setIsTestRunning(false);
    
    if (onTestComplete) {
      onTestComplete(result);
    }

    toast({
      title: result.success ? 'Test Passed' : 'Test Failed',
      description: result.message,
      variant: result.success ? 'default' : 'destructive'
    });
  };

  const runBulkTest = async () => {
    const usersWithIntegration = users.filter(u => u.integrations[selectedIntegration]);
    
    if (usersWithIntegration.length === 0) {
      toast({
        title: 'No Users Found',
        description: `No users have ${selectedIntegration} connected`,
        variant: 'destructive'
      });
      return;
    }

    setIsTestRunning(true);
    
    for (const user of usersWithIntegration) {
      setSelectedUser(user.id);
      await runConnectionTest();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    setIsTestRunning(false);
  };

  const getStatusColor = (status) => {
    if (status >= 200 && status < 300) return 'text-green-600';
    if (status >= 400 && status < 500) return 'text-red-600';
    return 'text-yellow-600';
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">Select User</label>
          <select
            className="w-full px-3 py-2 border rounded-md"
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            disabled={isTestRunning}
          >
            <option value="">Choose a user...</option>
            {users.map(user => (
              <option key={user.id} value={user.id}>
                {user.name} ({user.email})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Select Integration</label>
          <select
            className="w-full px-3 py-2 border rounded-md"
            value={selectedIntegration}
            onChange={(e) => setSelectedIntegration(e.target.value)}
            disabled={isTestRunning}
          >
            <option value="">Choose an integration...</option>
            {integrations.map(integration => (
              <option key={integration.name} value={integration.name}>
                {integration.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Test Endpoint (Optional)</label>
          <Input
            type="text"
            placeholder="e.g., /api/user"
            value={testEndpoint}
            onChange={(e) => setTestEndpoint(e.target.value)}
            disabled={isTestRunning}
          />
        </div>
      </div>

      <div className="flex gap-4">
        <Button
          onClick={runConnectionTest}
          disabled={isTestRunning || !selectedUser || !selectedIntegration}
        >
          {isTestRunning ? 'Testing...' : 'Run Connection Test'}
        </Button>
        
        <Button
          variant="outline"
          onClick={runBulkTest}
          disabled={isTestRunning || !selectedIntegration}
        >
          Test All Users with {selectedIntegration || 'Integration'}
        </Button>

        <Button
          variant="outline"
          onClick={() => setTestResults([])}
          disabled={testResults.length === 0}
        >
          Clear Results
        </Button>
      </div>

      {selectedUser && selectedIntegration && (
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="font-medium mb-2">Connection Details</h3>
          {(() => {
            const user = dummyUserManager.read(selectedUser);
            const integration = user?.integrations[selectedIntegration];
            
            if (!integration) {
              return (
                <p className="text-red-600">
                  User does not have {selectedIntegration} connected
                </p>
              );
            }
            
            return (
              <div className="space-y-1 text-sm">
                <p>Status: <span className="text-green-600">Connected</span></p>
                <p>Connected At: {new Date(integration.connectedAt).toLocaleString()}</p>
                <p>Token Expires: {integration.credentials?.expires_at ? 
                  new Date(integration.credentials.expires_at).toLocaleString() : 
                  'Never'
                }</p>
              </div>
            );
          })()}
        </div>
      )}

      {testResults.length > 0 && (
        <div>
          <h3 className="text-lg font-medium mb-3">Test Results</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Integration</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Response Time</TableHead>
                <TableHead>Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {testResults.map((result, index) => (
                <TableRow key={index}>
                  <TableCell className="text-sm">
                    {new Date(result.timestamp).toLocaleTimeString()}
                  </TableCell>
                  <TableCell>{result.user}</TableCell>
                  <TableCell>{result.integration}</TableCell>
                  <TableCell>{result.endpoint}</TableCell>
                  <TableCell>
                    <span className={`font-medium ${getStatusColor(result.status)}`}>
                      {result.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    {result.responseTime ? `${result.responseTime}ms` : '-'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {result.message}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};