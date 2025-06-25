import React, { useState, useEffect } from 'react';
import { Button } from '../components/button';
import { DropdownMenu } from '../components/dropdown-menu';
import { Dialog } from '../components/dialog';
import { toast } from '../components/use-toast';
import EnvironmentEditor from './EnvironmentEditor';
import { FileDown, Upload, RefreshCw, Cloud, Server, Package } from 'lucide-react';

const ENVIRONMENT_ICONS = {
  local: Server,
  staging: Package,
  production: Cloud
};

const EnvironmentManager = ({
  environments = ['local', 'staging', 'production'],
  currentEnvironment = 'local',
  onEnvironmentChange,
  onImport,
  onExport,
  onSync,
  apiEndpoint = '/api/environment'
}) => {
  const [selectedEnvironment, setSelectedEnvironment] = useState(currentEnvironment);
  const [variables, setVariables] = useState({});
  const [loading, setLoading] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importData, setImportData] = useState('');

  useEffect(() => {
    fetchVariables(selectedEnvironment);
  }, [selectedEnvironment]);

  const fetchVariables = async (env) => {
    setLoading(true);
    try {
      const response = await fetch(`${apiEndpoint}/variables/${env}`);
      if (!response.ok) throw new Error('Failed to fetch variables');
      
      const data = await response.json();
      setVariables(prev => ({
        ...prev,
        [env]: data.variables || []
      }));
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to load ${env} variables: ${error.message}`,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEnvironmentChange = (env) => {
    setSelectedEnvironment(env);
    if (onEnvironmentChange) {
      onEnvironmentChange(env);
    }
  };

  const handleSaveVariables = async (updatedVars) => {
    setLoading(true);
    try {
      const response = await fetch(`${apiEndpoint}/variables/${selectedEnvironment}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ variables: updatedVars })
      });

      if (!response.ok) throw new Error('Failed to save variables');
      
      setVariables(prev => ({
        ...prev,
        [selectedEnvironment]: updatedVars
      }));

      toast({
        title: "Success",
        description: `${selectedEnvironment} variables saved successfully`
      });
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to save variables: ${error.message}`,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    const envVars = variables[selectedEnvironment] || [];
    const exportData = envVars.reduce((acc, v) => {
      if (!v.isSecret) {
        acc[v.key] = v.value;
      }
      return acc;
    }, {});

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedEnvironment}-env-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    if (onExport) {
      onExport(selectedEnvironment, exportData);
    }

    toast({
      title: "Export Complete",
      description: `Exported ${Object.keys(exportData).length} non-secret variables`
    });
  };

  const handleImport = () => {
    try {
      const parsed = JSON.parse(importData);
      const importedVars = Object.entries(parsed).map(([key, value]) => ({
        id: Date.now().toString() + Math.random(),
        key,
        value: String(value),
        description: '',
        isSecret: false,
        environment: selectedEnvironment
      }));

      const existingVars = variables[selectedEnvironment] || [];
      const merged = [...existingVars];

      importedVars.forEach(importVar => {
        const existingIndex = merged.findIndex(v => v.key === importVar.key);
        if (existingIndex >= 0) {
          merged[existingIndex] = { ...merged[existingIndex], value: importVar.value };
        } else {
          merged.push(importVar);
        }
      });

      handleSaveVariables(merged);
      setShowImportDialog(false);
      setImportData('');

      if (onImport) {
        onImport(selectedEnvironment, parsed);
      }

      toast({
        title: "Import Successful",
        description: `Imported ${importedVars.length} variables`
      });
    } catch (error) {
      toast({
        title: "Import Error",
        description: "Invalid JSON format",
        variant: "destructive"
      });
    }
  };

  const handleSync = async () => {
    if (selectedEnvironment !== 'production') {
      toast({
        title: "Sync Not Available",
        description: "Sync is only available for production environment",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${apiEndpoint}/sync/aws-parameter-store`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ environment: selectedEnvironment })
      });

      if (!response.ok) throw new Error('Failed to sync with AWS');
      
      const result = await response.json();
      
      toast({
        title: "Sync Complete",
        description: `Synced ${result.count} variables with AWS Parameter Store`
      });

      // Refresh variables after sync
      fetchVariables(selectedEnvironment);

      if (onSync) {
        onSync(selectedEnvironment, result);
      }
    } catch (error) {
      toast({
        title: "Sync Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const EnvIcon = ENVIRONMENT_ICONS[selectedEnvironment] || Server;

  return (
    <div className="w-full space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold">Environment Variables</h2>
          <DropdownMenu>
            <DropdownMenu.Trigger asChild>
              <Button variant="outline" className="flex items-center gap-2">
                <EnvIcon className="w-4 h-4" />
                {selectedEnvironment.charAt(0).toUpperCase() + selectedEnvironment.slice(1)}
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content>
              {environments.map(env => {
                const Icon = ENVIRONMENT_ICONS[env] || Server;
                return (
                  <DropdownMenu.Item
                    key={env}
                    onClick={() => handleEnvironmentChange(env)}
                    className="flex items-center gap-2"
                  >
                    <Icon className="w-4 h-4" />
                    {env.charAt(0).toUpperCase() + env.slice(1)}
                  </DropdownMenu.Item>
                );
              })}
            </DropdownMenu.Content>
          </DropdownMenu>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={loading || !variables[selectedEnvironment]?.length}
          >
            <FileDown className="w-4 h-4 mr-2" />
            Export
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowImportDialog(true)}
            disabled={loading}
          >
            <Upload className="w-4 h-4 mr-2" />
            Import
          </Button>
          
          {selectedEnvironment === 'production' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={loading}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Sync with AWS
            </Button>
          )}
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          </div>
        ) : (
          <EnvironmentEditor
            variables={variables[selectedEnvironment] || []}
            environment={selectedEnvironment}
            onSave={handleSaveVariables}
            readOnly={selectedEnvironment === 'production' && !window.confirm('Are you sure you want to edit production variables?')}
          />
        )}
      </div>

      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>Import Environment Variables</Dialog.Title>
            <Dialog.Description>
              Paste your JSON formatted environment variables below
            </Dialog.Description>
          </Dialog.Header>
          
          <div className="space-y-4">
            <textarea
              className="w-full h-64 p-3 border rounded-md font-mono text-sm"
              placeholder='{"API_KEY": "value", "DATABASE_URL": "value"}'
              value={importData}
              onChange={(e) => setImportData(e.target.value)}
            />
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowImportDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={!importData.trim()}>
                Import
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog>
    </div>
  );
};

export default EnvironmentManager;