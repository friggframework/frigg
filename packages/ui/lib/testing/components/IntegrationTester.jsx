import React, { useState } from 'react';
import { Button } from '../../components/button';
import { Input } from '../../components/input';
import { useToast } from '../../components/use-toast';
import { dummyUserManager } from '../models/DummyUser';

export const IntegrationTester = ({ integrations = [], apiUrl, onTestComplete }) => {
  const [selectedIntegration, setSelectedIntegration] = useState('');
  const [selectedWorkflow, setSelectedWorkflow] = useState('');
  const [workflowConfig, setWorkflowConfig] = useState({});
  const [isRunning, setIsRunning] = useState(false);
  const [workflowResults, setWorkflowResults] = useState([]);
  const { toast } = useToast();

  const workflows = {
    auth: {
      name: 'Authentication Flow',
      description: 'Test OAuth2 authentication flow',
      steps: [
        { id: 'init', name: 'Initialize Auth', duration: 500 },
        { id: 'redirect', name: 'Redirect to Provider', duration: 1000 },
        { id: 'callback', name: 'Handle Callback', duration: 800 },
        { id: 'token', name: 'Exchange Token', duration: 600 },
        { id: 'profile', name: 'Fetch User Profile', duration: 400 }
      ]
    },
    crud: {
      name: 'CRUD Operations',
      description: 'Test Create, Read, Update, Delete operations',
      steps: [
        { id: 'create', name: 'Create Entity', duration: 600 },
        { id: 'read', name: 'Read Entity', duration: 300 },
        { id: 'update', name: 'Update Entity', duration: 500 },
        { id: 'delete', name: 'Delete Entity', duration: 400 },
        { id: 'verify', name: 'Verify Deletion', duration: 300 }
      ]
    },
    sync: {
      name: 'Data Synchronization',
      description: 'Test bi-directional data sync',
      steps: [
        { id: 'fetch_local', name: 'Fetch Local Data', duration: 400 },
        { id: 'fetch_remote', name: 'Fetch Remote Data', duration: 800 },
        { id: 'compare', name: 'Compare Data', duration: 600 },
        { id: 'sync', name: 'Synchronize Changes', duration: 1200 },
        { id: 'verify', name: 'Verify Sync', duration: 500 }
      ]
    },
    webhook: {
      name: 'Webhook Processing',
      description: 'Test webhook receipt and processing',
      steps: [
        { id: 'register', name: 'Register Webhook', duration: 700 },
        { id: 'receive', name: 'Receive Event', duration: 200 },
        { id: 'validate', name: 'Validate Payload', duration: 300 },
        { id: 'process', name: 'Process Event', duration: 800 },
        { id: 'respond', name: 'Send Response', duration: 200 }
      ]
    },
    batch: {
      name: 'Batch Operations',
      description: 'Test bulk data operations',
      steps: [
        { id: 'prepare', name: 'Prepare Batch Data', duration: 500 },
        { id: 'validate', name: 'Validate Data', duration: 600 },
        { id: 'upload', name: 'Upload Batch', duration: 1500 },
        { id: 'process', name: 'Process Results', duration: 800 },
        { id: 'report', name: 'Generate Report', duration: 400 }
      ]
    }
  };

  const runWorkflow = async () => {
    if (!selectedIntegration || !selectedWorkflow) {
      toast({
        title: 'Missing Information',
        description: 'Please select an integration and workflow',
        variant: 'destructive'
      });
      return;
    }

    setIsRunning(true);
    const workflow = workflows[selectedWorkflow];
    const result = {
      integration: selectedIntegration,
      workflow: workflow.name,
      startTime: new Date(),
      steps: [],
      config: workflowConfig
    };

    try {
      for (const step of workflow.steps) {
        const stepResult = {
          id: step.id,
          name: step.name,
          status: 'running',
          startTime: new Date()
        };

        setWorkflowResults(prev => {
          const updated = [...prev];
          const currentIndex = updated.findIndex(r => 
            r.integration === selectedIntegration && 
            r.workflow === workflow.name &&
            r.startTime === result.startTime
          );
          
          if (currentIndex >= 0) {
            updated[currentIndex] = { ...result, steps: [...result.steps, stepResult] };
          } else {
            updated.unshift({ ...result, steps: [stepResult] });
          }
          
          return updated.slice(0, 10);
        });

        // Simulate step execution
        await new Promise(resolve => setTimeout(resolve, step.duration));

        // Simulate random failures
        const success = Math.random() > 0.1;
        
        stepResult.endTime = new Date();
        stepResult.duration = stepResult.endTime - stepResult.startTime;
        stepResult.status = success ? 'success' : 'failed';
        
        if (!success) {
          stepResult.error = `Step ${step.name} failed: ${['Network error', 'Invalid response', 'Timeout'][Math.floor(Math.random() * 3)]}`;
          throw new Error(stepResult.error);
        }

        stepResult.data = {
          processed: Math.floor(Math.random() * 100),
          latency: Math.floor(Math.random() * 200) + 50
        };

        result.steps.push(stepResult);
      }

      result.endTime = new Date();
      result.duration = result.endTime - result.startTime;
      result.status = 'success';
      result.summary = {
        totalSteps: workflow.steps.length,
        successfulSteps: result.steps.filter(s => s.status === 'success').length,
        failedSteps: result.steps.filter(s => s.status === 'failed').length,
        totalDuration: result.duration
      };

    } catch (error) {
      result.endTime = new Date();
      result.duration = result.endTime - result.startTime;
      result.status = 'failed';
      result.error = error.message;
    }

    setWorkflowResults(prev => {
      const updated = [...prev];
      const currentIndex = updated.findIndex(r => 
        r.integration === selectedIntegration && 
        r.workflow === workflow.name &&
        r.startTime === result.startTime
      );
      
      if (currentIndex >= 0) {
        updated[currentIndex] = result;
      }
      
      return updated;
    });

    setIsRunning(false);

    if (onTestComplete) {
      onTestComplete({
        success: result.status === 'success',
        message: result.status === 'success' 
          ? `Workflow ${workflow.name} completed successfully`
          : `Workflow ${workflow.name} failed: ${result.error}`,
        data: result
      });
    }

    toast({
      title: result.status === 'success' ? 'Workflow Completed' : 'Workflow Failed',
      description: result.status === 'success' 
        ? `${workflow.name} completed in ${result.duration}ms`
        : result.error,
      variant: result.status === 'success' ? 'default' : 'destructive'
    });
  };

  const selectedWorkflowData = workflows[selectedWorkflow];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Workflow Configuration</h3>
          
          <div>
            <label className="block text-sm font-medium mb-2">Integration</label>
            <select
              className="w-full px-3 py-2 border rounded-md"
              value={selectedIntegration}
              onChange={(e) => setSelectedIntegration(e.target.value)}
              disabled={isRunning}
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
            <label className="block text-sm font-medium mb-2">Workflow</label>
            <select
              className="w-full px-3 py-2 border rounded-md"
              value={selectedWorkflow}
              onChange={(e) => setSelectedWorkflow(e.target.value)}
              disabled={isRunning}
            >
              <option value="">Choose a workflow...</option>
              {Object.entries(workflows).map(([key, workflow]) => (
                <option key={key} value={key}>
                  {workflow.name}
                </option>
              ))}
            </select>
          </div>

          {selectedWorkflowData && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">{selectedWorkflowData.description}</p>
              <div className="mt-3">
                <p className="text-sm font-medium mb-2">Steps:</p>
                <ol className="list-decimal list-inside space-y-1">
                  {selectedWorkflowData.steps.map(step => (
                    <li key={step.id} className="text-sm text-gray-600">
                      {step.name} (~{step.duration}ms)
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">Additional Configuration</label>
            <div className="space-y-2">
              <Input
                type="number"
                placeholder="Batch size (for batch operations)"
                value={workflowConfig.batchSize || ''}
                onChange={(e) => setWorkflowConfig({ ...workflowConfig, batchSize: e.target.value })}
                disabled={isRunning}
              />
              <Input
                type="text"
                placeholder="Entity type (for CRUD operations)"
                value={workflowConfig.entityType || ''}
                onChange={(e) => setWorkflowConfig({ ...workflowConfig, entityType: e.target.value })}
                disabled={isRunning}
              />
            </div>
          </div>

          <Button
            onClick={runWorkflow}
            disabled={isRunning || !selectedIntegration || !selectedWorkflow}
            className="w-full"
          >
            {isRunning ? 'Running Workflow...' : 'Run Workflow Test'}
          </Button>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-medium">Recent Results</h3>
          
          {workflowResults.length > 0 ? (
            <div className="space-y-3">
              {workflowResults.map((result, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium">{result.workflow}</p>
                      <p className="text-sm text-gray-600">{result.integration}</p>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs ${
                      result.status === 'success' 
                        ? 'bg-green-100 text-green-800'
                        : result.status === 'failed'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {result.status || 'running'}
                    </span>
                  </div>
                  
                  {result.steps && (
                    <div className="space-y-1 mt-3">
                      {result.steps.map((step, stepIndex) => (
                        <div key={stepIndex} className="flex items-center gap-2 text-sm">
                          <span className={`w-2 h-2 rounded-full ${
                            step.status === 'success' ? 'bg-green-500' :
                            step.status === 'failed' ? 'bg-red-500' :
                            'bg-yellow-500 animate-pulse'
                          }`} />
                          <span className="flex-1">{step.name}</span>
                          {step.duration && (
                            <span className="text-gray-500">{step.duration}ms</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {result.summary && (
                    <div className="mt-3 pt-3 border-t text-sm text-gray-600">
                      <p>Duration: {result.duration}ms</p>
                      <p>Success: {result.summary.successfulSteps}/{result.summary.totalSteps}</p>
                    </div>
                  )}
                  
                  {result.error && (
                    <p className="mt-2 text-sm text-red-600">{result.error}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No workflow results yet. Run a workflow to see results.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};