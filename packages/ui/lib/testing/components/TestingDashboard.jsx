import React, { useState, useEffect } from 'react';
import { Button } from '../../components/button';
import { Input } from '../../components/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/dropdown-menu';
import { useToast } from '../../components/use-toast';
import { dummyUserManager } from '../models/DummyUser';
import { UserManagementPanel } from './UserManagementPanel';
import { ConnectionTester } from './ConnectionTester';
import { EntityManager } from './EntityManager';
import { TestDataGenerator } from './TestDataGenerator';
import { IntegrationTester } from './IntegrationTester';
import { TestResults } from './TestResults';

export const TestingDashboard = ({ integrations = [], apiUrl }) => {
  const [activePanel, setActivePanel] = useState('users');
  const [testResults, setTestResults] = useState([]);
  const { toast } = useToast();

  const panels = {
    users: {
      title: 'User Management',
      component: UserManagementPanel
    },
    connections: {
      title: 'Connection Testing',
      component: ConnectionTester
    },
    entities: {
      title: 'Entity Management',
      component: EntityManager
    },
    data: {
      title: 'Test Data Generator',
      component: TestDataGenerator
    },
    integration: {
      title: 'Integration Testing',
      component: IntegrationTester
    },
    results: {
      title: 'Test Results',
      component: TestResults
    }
  };

  const ActivePanelComponent = panels[activePanel].component;

  const handleTestComplete = (result) => {
    setTestResults(prev => [...prev, { ...result, timestamp: new Date() }]);
    toast({
      title: result.success ? 'Test Passed' : 'Test Failed',
      description: result.message,
      variant: result.success ? 'default' : 'destructive'
    });
  };

  const exportTestData = () => {
    const data = {
      users: dummyUserManager.export(),
      testResults,
      exportedAt: new Date()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `frigg-test-data-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast({
      title: 'Test Data Exported',
      description: 'Test data has been exported successfully'
    });
  };

  return (
    <div className="w-full h-full flex flex-col">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Frigg Testing Dashboard</h1>
            <p className="text-sm text-gray-600 mt-1">
              Local testing environment for integration development
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={exportTestData}
            >
              Export Test Data
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">Quick Actions</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => dummyUserManager.generateTestUsers(5)}>
                  Generate 5 Test Users
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => dummyUserManager.reset()}>
                  Reset All Data
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTestResults([])}>
                  Clear Test Results
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="border-b px-6">
        <nav className="flex space-x-6">
          {Object.entries(panels).map(([key, panel]) => (
            <button
              key={key}
              onClick={() => setActivePanel(key)}
              className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activePanel === key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {panel.title}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <ActivePanelComponent
          integrations={integrations}
          apiUrl={apiUrl}
          onTestComplete={handleTestComplete}
          testResults={testResults}
        />
      </div>
    </div>
  );
};