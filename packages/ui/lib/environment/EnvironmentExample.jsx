import React from 'react';
import { EnvironmentManager } from './index';
import { Toaster } from '../components/toaster';

/**
 * Example usage of the Environment Manager component
 * This demonstrates how to integrate the environment variable management system
 */
const EnvironmentExample = () => {
  // API endpoint for your backend
  const API_ENDPOINT = process.env.REACT_APP_API_URL || 'http://localhost:3001/api/environment';

  // Available environments
  const environments = ['local', 'staging', 'production'];

  // Handle environment change
  const handleEnvironmentChange = (newEnvironment) => {
    console.log('Environment changed to:', newEnvironment);
    // You can add custom logic here, e.g., updating app state
  };

  // Handle import completion
  const handleImport = (environment, data) => {
    console.log(`Imported ${Object.keys(data).length} variables to ${environment}`);
    // Custom import logic
  };

  // Handle export completion
  const handleExport = (environment, data) => {
    console.log(`Exported ${Object.keys(data).length} variables from ${environment}`);
    // Custom export logic
  };

  // Handle AWS sync completion
  const handleSync = (environment, result) => {
    console.log(`Synced ${environment} with AWS:`, result);
    // Custom sync logic
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow">
          <div className="p-6">
            <EnvironmentManager
              environments={environments}
              currentEnvironment="local"
              apiEndpoint={API_ENDPOINT}
              onEnvironmentChange={handleEnvironmentChange}
              onImport={handleImport}
              onExport={handleExport}
              onSync={handleSync}
            />
          </div>
        </div>
        
        {/* Additional UI sections */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li>• Click on environment name to switch between environments</li>
              <li>• Use the eye icon to toggle visibility of secret values</li>
              <li>• Export non-secret variables for sharing with team</li>
              <li>• Import variables from JSON or .env format</li>
              <li>• Sync production variables with AWS Parameter Store</li>
            </ul>
          </div>
          
          {/* Security Notes */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Security Notes</h3>
            <ul className="space-y-2 text-sm text-gray-600">
              <li>• Variables with sensitive names are automatically marked as secrets</li>
              <li>• Secret values are masked in the UI by default</li>
              <li>• Exports exclude secret values unless explicitly included</li>
              <li>• Production environment requires confirmation before editing</li>
              <li>• All changes are backed up automatically</li>
            </ul>
          </div>
        </div>
        
        {/* Integration Guide */}
        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Integration Guide</h3>
          <pre className="bg-gray-50 p-4 rounded text-sm overflow-x-auto">
{`// 1. Install required dependencies
npm install dotenv aws-sdk express

// 2. Set up your Express server with the environment router
import express from 'express';
import { environmentRouter } from './api/environment';

const app = express();
app.use(express.json());
app.use('/api/environment', environmentRouter);

// 3. Configure AWS credentials (for production sync)
// Set these environment variables:
// - AWS_REGION=us-east-1
// - AWS_ACCESS_KEY_ID=your-key
// - AWS_SECRET_ACCESS_KEY=your-secret
// - AWS_PARAMETER_PREFIX=/frigg

// 4. Use the EnvironmentManager component in your React app
import { EnvironmentManager } from '@friggframework/ui/environment';

function App() {
  return (
    <EnvironmentManager
      apiEndpoint="http://localhost:3001/api/environment"
      environments={['local', 'staging', 'production']}
    />
  );
}`}</pre>
        </div>
      </div>
      
      {/* Toast notifications */}
      <Toaster />
    </div>
  );
};

export default EnvironmentExample;