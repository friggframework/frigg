import React, { useState } from 'react';
import { Button } from '../../components/button';
import { Input } from '../../components/input';
import { useToast } from '../../components/use-toast';
import { dummyUserManager } from '../models/DummyUser';

export const TestDataGenerator = ({ integrations = [], onTestComplete }) => {
  const [selectedIntegration, setSelectedIntegration] = useState('');
  const [dataConfig, setDataConfig] = useState({
    entityType: 'contact',
    count: 10,
    includeRelations: false,
    randomizeData: true
  });
  const [generatedData, setGeneratedData] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const dataTemplates = {
    contact: {
      fields: ['firstName', 'lastName', 'email', 'phone', 'company', 'jobTitle'],
      generator: (index) => ({
        firstName: `Test${index}`,
        lastName: `User${index}`,
        email: `test.user${index}@example.com`,
        phone: `+1${String(Math.floor(Math.random() * 9000000000) + 1000000000)}`,
        company: `Company ${Math.floor(Math.random() * 100)}`,
        jobTitle: ['Manager', 'Developer', 'Designer', 'Analyst'][Math.floor(Math.random() * 4)]
      })
    },
    task: {
      fields: ['title', 'description', 'dueDate', 'priority', 'status', 'assignee'],
      generator: (index) => ({
        title: `Task ${index}: ${['Fix bug', 'Add feature', 'Update docs', 'Review PR'][Math.floor(Math.random() * 4)]}`,
        description: `This is a test task description for task ${index}`,
        dueDate: new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
        priority: ['low', 'medium', 'high', 'urgent'][Math.floor(Math.random() * 4)],
        status: ['todo', 'in_progress', 'review', 'done'][Math.floor(Math.random() * 4)],
        assignee: `user${Math.floor(Math.random() * 5)}`
      })
    },
    deal: {
      fields: ['name', 'amount', 'stage', 'closeDate', 'probability', 'contact'],
      generator: (index) => ({
        name: `Deal ${index}: ${['New Contract', 'Renewal', 'Upgrade', 'Expansion'][Math.floor(Math.random() * 4)]}`,
        amount: Math.floor(Math.random() * 100000) + 1000,
        stage: ['prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'][Math.floor(Math.random() * 6)],
        closeDate: new Date(Date.now() + Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString(),
        probability: Math.floor(Math.random() * 100),
        contact: `contact_${Math.floor(Math.random() * 10)}`
      })
    },
    event: {
      fields: ['title', 'startTime', 'endTime', 'location', 'attendees', 'description'],
      generator: (index) => ({
        title: `Event ${index}: ${['Meeting', 'Workshop', 'Webinar', 'Conference'][Math.floor(Math.random() * 4)]}`,
        startTime: new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000 + 3600000).toISOString(),
        location: ['Office', 'Remote', 'Conference Room A', 'External'][Math.floor(Math.random() * 4)],
        attendees: Array.from({ length: Math.floor(Math.random() * 5) + 1 }, (_, i) => `user${i}`),
        description: `This is a test event description for event ${index}`
      })
    }
  };

  const generateTestData = () => {
    setIsGenerating(true);
    
    try {
      const template = dataTemplates[dataConfig.entityType];
      if (!template) {
        throw new Error(`Unknown entity type: ${dataConfig.entityType}`);
      }

      const data = [];
      for (let i = 0; i < dataConfig.count; i++) {
        const entity = template.generator(i);
        
        if (dataConfig.randomizeData) {
          // Add some randomization to make data more realistic
          Object.keys(entity).forEach(key => {
            if (typeof entity[key] === 'string' && Math.random() > 0.8) {
              entity[key] += ` (${Math.random().toString(36).substring(7)})`;
            }
          });
        }

        if (dataConfig.includeRelations) {
          entity.relatedEntities = {
            contacts: Array.from({ length: Math.floor(Math.random() * 3) }, () => 
              `contact_${Math.floor(Math.random() * 100)}`
            ),
            tasks: Array.from({ length: Math.floor(Math.random() * 5) }, () => 
              `task_${Math.floor(Math.random() * 100)}`
            )
          };
        }

        data.push({
          id: `${dataConfig.entityType}_${Date.now()}_${i}`,
          type: dataConfig.entityType,
          ...entity,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }

      setGeneratedData({
        integration: selectedIntegration,
        entityType: dataConfig.entityType,
        count: data.length,
        data,
        generatedAt: new Date()
      });

      if (onTestComplete) {
        onTestComplete({
          success: true,
          message: `Generated ${data.length} ${dataConfig.entityType} entities`,
          data: { count: data.length, entityType: dataConfig.entityType }
        });
      }

      toast({
        title: 'Test Data Generated',
        description: `Generated ${data.length} ${dataConfig.entityType} entities`
      });
    } catch (error) {
      toast({
        title: 'Generation Failed',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const exportData = () => {
    if (!generatedData) return;

    const blob = new Blob([JSON.stringify(generatedData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-data-${dataConfig.entityType}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast({
      title: 'Data Exported',
      description: 'Test data has been exported successfully'
    });
  };

  const applyToUser = () => {
    if (!generatedData || !selectedIntegration) return;

    const users = dummyUserManager.getUsersWithIntegration(selectedIntegration);
    if (users.length === 0) {
      toast({
        title: 'No Users Found',
        description: `No users have ${selectedIntegration} connected`,
        variant: 'destructive'
      });
      return;
    }

    // In a real implementation, this would store the data for the user
    toast({
      title: 'Data Applied',
      description: `Test data applied to ${users.length} users with ${selectedIntegration}`
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Configuration</h3>
          
          <div>
            <label className="block text-sm font-medium mb-2">Integration (Optional)</label>
            <select
              className="w-full px-3 py-2 border rounded-md"
              value={selectedIntegration}
              onChange={(e) => setSelectedIntegration(e.target.value)}
            >
              <option value="">None - Generate standalone data</option>
              {integrations.map(integration => (
                <option key={integration.name} value={integration.name}>
                  {integration.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Entity Type</label>
            <select
              className="w-full px-3 py-2 border rounded-md"
              value={dataConfig.entityType}
              onChange={(e) => setDataConfig({ ...dataConfig, entityType: e.target.value })}
            >
              <option value="contact">Contacts</option>
              <option value="task">Tasks</option>
              <option value="deal">Deals</option>
              <option value="event">Events</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Number of Records</label>
            <Input
              type="number"
              min="1"
              max="1000"
              value={dataConfig.count}
              onChange={(e) => setDataConfig({ ...dataConfig, count: parseInt(e.target.value) || 1 })}
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={dataConfig.includeRelations}
                onChange={(e) => setDataConfig({ ...dataConfig, includeRelations: e.target.checked })}
              />
              <span className="text-sm">Include related entities</span>
            </label>
            
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={dataConfig.randomizeData}
                onChange={(e) => setDataConfig({ ...dataConfig, randomizeData: e.target.checked })}
              />
              <span className="text-sm">Randomize data values</span>
            </label>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={generateTestData}
              disabled={isGenerating}
              className="flex-1"
            >
              {isGenerating ? 'Generating...' : 'Generate Test Data'}
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-medium">Preview</h3>
          
          {generatedData ? (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm">
                  <strong>Generated:</strong> {generatedData.count} {generatedData.entityType} entities
                </p>
                <p className="text-sm">
                  <strong>Time:</strong> {new Date(generatedData.generatedAt).toLocaleString()}
                </p>
              </div>

              <div className="border rounded-lg p-4 max-h-96 overflow-auto">
                <pre className="text-xs">
                  {JSON.stringify(generatedData.data.slice(0, 3), null, 2)}
                  {generatedData.data.length > 3 && '\n... and more'}
                </pre>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={exportData}>
                  Export JSON
                </Button>
                {selectedIntegration && (
                  <Button variant="outline" onClick={applyToUser}>
                    Apply to Users
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              Configure and generate test data to see preview
            </div>
          )}
        </div>
      </div>

      <div className="border-t pt-6">
        <h3 className="text-lg font-medium mb-4">Available Fields</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(dataTemplates).map(([type, template]) => (
            <div key={type} className="border rounded-lg p-4">
              <h4 className="font-medium mb-2 capitalize">{type}</h4>
              <div className="flex flex-wrap gap-2">
                {template.fields.map(field => (
                  <span
                    key={field}
                    className="px-2 py-1 bg-gray-100 rounded text-sm"
                  >
                    {field}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};