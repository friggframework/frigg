import React, { useState, useEffect } from 'react';
import { Button } from '../../components/button';
import { Input } from '../../components/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/table';
import { useToast } from '../../components/use-toast';
import { dummyUserManager } from '../models/DummyUser';

export const EntityManager = ({ integrations = [], onTestComplete }) => {
  const [entities, setEntities] = useState({});
  const [selectedIntegration, setSelectedIntegration] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const { toast } = useToast();

  const users = dummyUserManager.readAll();

  useEffect(() => {
    // Load saved entities from localStorage
    const savedEntities = localStorage.getItem('frigg-test-entities');
    if (savedEntities) {
      setEntities(JSON.parse(savedEntities));
    }
  }, []);

  const saveEntities = (newEntities) => {
    setEntities(newEntities);
    localStorage.setItem('frigg-test-entities', JSON.stringify(newEntities));
  };

  const createEntity = (entityData) => {
    const integrationEntities = entities[selectedIntegration] || {};
    const userEntities = integrationEntities[selectedUser] || [];
    
    const newEntity = {
      id: `entity_${Date.now()}`,
      ...entityData,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const updatedEntities = {
      ...entities,
      [selectedIntegration]: {
        ...integrationEntities,
        [selectedUser]: [...userEntities, newEntity]
      }
    };

    saveEntities(updatedEntities);
    setIsCreateDialogOpen(false);
    
    toast({
      title: 'Entity Created',
      description: `${entityData.type} entity created successfully`
    });
  };

  const updateEntity = (entityId, updates) => {
    const integrationEntities = entities[selectedIntegration] || {};
    const userEntities = integrationEntities[selectedUser] || [];
    
    const updatedUserEntities = userEntities.map(entity => 
      entity.id === entityId 
        ? { ...entity, ...updates, updatedAt: new Date() }
        : entity
    );

    const updatedEntities = {
      ...entities,
      [selectedIntegration]: {
        ...integrationEntities,
        [selectedUser]: updatedUserEntities
      }
    };

    saveEntities(updatedEntities);
    
    toast({
      title: 'Entity Updated',
      description: 'Entity has been updated successfully'
    });
  };

  const deleteEntity = (entityId) => {
    const integrationEntities = entities[selectedIntegration] || {};
    const userEntities = integrationEntities[selectedUser] || [];
    
    const updatedUserEntities = userEntities.filter(entity => entity.id !== entityId);

    const updatedEntities = {
      ...entities,
      [selectedIntegration]: {
        ...integrationEntities,
        [selectedUser]: updatedUserEntities
      }
    };

    saveEntities(updatedEntities);
    
    toast({
      title: 'Entity Deleted',
      description: 'Entity has been deleted successfully'
    });
  };

  const getUserEntities = () => {
    if (!selectedIntegration || !selectedUser) return [];
    return entities[selectedIntegration]?.[selectedUser] || [];
  };

  const EntityForm = ({ entity, onSubmit }) => {
    const [formData, setFormData] = useState({
      type: entity?.type || 'contact',
      name: entity?.name || '',
      data: entity?.data || {}
    });

    const handleSubmit = (e) => {
      e.preventDefault();
      onSubmit(formData);
    };

    const handleDataChange = (key, value) => {
      setFormData({
        ...formData,
        data: {
          ...formData.data,
          [key]: value
        }
      });
    };

    const entityTypes = {
      contact: ['email', 'phone', 'company'],
      task: ['title', 'description', 'due_date', 'status'],
      deal: ['title', 'amount', 'stage', 'close_date'],
      ticket: ['subject', 'description', 'priority', 'status'],
      custom: []
    };

    const fields = entityTypes[formData.type] || [];

    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Entity Type</label>
          <select
            className="w-full px-3 py-2 border rounded-md"
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value, data: {} })}
          >
            <option value="contact">Contact</option>
            <option value="task">Task</option>
            <option value="deal">Deal</option>
            <option value="ticket">Ticket</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Name</label>
          <Input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
        </div>

        {fields.map(field => (
          <div key={field}>
            <label className="block text-sm font-medium mb-1 capitalize">
              {field.replace('_', ' ')}
            </label>
            <Input
              type={field.includes('date') ? 'date' : 'text'}
              value={formData.data[field] || ''}
              onChange={(e) => handleDataChange(field, e.target.value)}
            />
          </div>
        ))}

        {formData.type === 'custom' && (
          <div className="space-y-2">
            <label className="block text-sm font-medium">Custom Fields</label>
            <textarea
              className="w-full px-3 py-2 border rounded-md"
              placeholder="Enter JSON data"
              value={JSON.stringify(formData.data, null, 2)}
              onChange={(e) => {
                try {
                  setFormData({ ...formData, data: JSON.parse(e.target.value) });
                } catch (error) {
                  // Invalid JSON, ignore
                }
              }}
              rows={4}
            />
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
            Cancel
          </Button>
          <Button type="submit">
            {entity ? 'Update' : 'Create'} Entity
          </Button>
        </div>
      </form>
    );
  };

  const userEntities = getUserEntities();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">Select Integration</label>
          <select
            className="w-full px-3 py-2 border rounded-md"
            value={selectedIntegration}
            onChange={(e) => {
              setSelectedIntegration(e.target.value);
              setSelectedUser('');
            }}
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
          <label className="block text-sm font-medium mb-2">Select User</label>
          <select
            className="w-full px-3 py-2 border rounded-md"
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            disabled={!selectedIntegration}
          >
            <option value="">Choose a user...</option>
            {users
              .filter(user => user.integrations[selectedIntegration])
              .map(user => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.email})
                </option>
              ))}
          </select>
        </div>

        <div className="flex items-end">
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button
                className="w-full"
                disabled={!selectedIntegration || !selectedUser}
              >
                Create Entity
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Entity</DialogTitle>
              </DialogHeader>
              <EntityForm onSubmit={createEntity} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {selectedIntegration && selectedUser && (
        <div>
          <h3 className="text-lg font-medium mb-3">
            Entities for {users.find(u => u.id === selectedUser)?.name} - {selectedIntegration}
          </h3>
          
          {userEntities.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userEntities.map(entity => (
                  <TableRow key={entity.id}>
                    <TableCell>
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">
                        {entity.type}
                      </span>
                    </TableCell>
                    <TableCell>{entity.name}</TableCell>
                    <TableCell>
                      <details className="cursor-pointer">
                        <summary className="text-sm text-gray-600">
                          {Object.keys(entity.data).length} fields
                        </summary>
                        <pre className="text-xs mt-2 p-2 bg-gray-50 rounded">
                          {JSON.stringify(entity.data, null, 2)}
                        </pre>
                      </details>
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(entity.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            // In a real implementation, this would open an edit dialog
                            toast({
                              title: 'Edit Entity',
                              description: 'Entity editing would be implemented here'
                            });
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            if (window.confirm('Are you sure you want to delete this entity?')) {
                              deleteEntity(entity.id);
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No entities found. Create an entity to get started.
            </div>
          )}
        </div>
      )}

      {(!selectedIntegration || !selectedUser) && (
        <div className="text-center py-8 text-gray-500">
          Select an integration and user to manage entities
        </div>
      )}
    </div>
  );
};