import React, { useState, useEffect, useCallback } from 'react';
import { Input } from '../components/input';
import { Button } from '../components/button';
import { Switch } from '../components/switch';
import { Trash2, Plus, Eye, EyeOff, Copy, Check, AlertCircle } from 'lucide-react';
import { toast } from '../components/use-toast';

const EnvironmentEditor = ({ 
  variables = [], 
  environment = 'local',
  onSave,
  onVariableChange,
  readOnly = false,
  allowedEnvironments = ['local', 'staging', 'production']
}) => {
  const [envVars, setEnvVars] = useState(variables);
  const [showValues, setShowValues] = useState({});
  const [copied, setCopied] = useState({});
  const [validationErrors, setValidationErrors] = useState({});

  useEffect(() => {
    setEnvVars(variables);
  }, [variables]);

  const validateVariable = (key, value) => {
    const errors = [];
    
    // Key validation
    if (!key) {
      errors.push('Key is required');
    } else if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) {
      errors.push('Key must start with a letter or underscore and contain only letters, numbers, and underscores');
    }
    
    // Value validation for specific types
    if (key.endsWith('_PORT')) {
      const port = parseInt(value);
      if (isNaN(port) || port < 1 || port > 65535) {
        errors.push('Port must be a number between 1 and 65535');
      }
    }
    
    if (key.endsWith('_URL') && value) {
      try {
        new URL(value);
      } catch {
        errors.push('Invalid URL format');
      }
    }
    
    return errors;
  };

  const handleAddVariable = () => {
    const newVar = {
      id: Date.now().toString(),
      key: '',
      value: '',
      description: '',
      isSecret: false,
      environment
    };
    setEnvVars([...envVars, newVar]);
  };

  const handleUpdateVariable = (id, field, value) => {
    const updated = envVars.map(v => {
      if (v.id === id) {
        const updatedVar = { ...v, [field]: value };
        
        // Validate if key or value changed
        if (field === 'key' || field === 'value') {
          const errors = validateVariable(
            field === 'key' ? value : v.key,
            field === 'value' ? value : v.value
          );
          setValidationErrors(prev => ({
            ...prev,
            [id]: errors.length > 0 ? errors : null
          }));
        }
        
        return updatedVar;
      }
      return v;
    });
    
    setEnvVars(updated);
    if (onVariableChange) {
      onVariableChange(updated);
    }
  };

  const handleDeleteVariable = (id) => {
    const filtered = envVars.filter(v => v.id !== id);
    setEnvVars(filtered);
    setValidationErrors(prev => {
      const { [id]: _, ...rest } = prev;
      return rest;
    });
    if (onVariableChange) {
      onVariableChange(filtered);
    }
  };

  const toggleShowValue = (id) => {
    setShowValues(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const copyToClipboard = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied({ [id]: true });
      toast({
        title: "Copied to clipboard",
        description: "Environment variable copied successfully"
      });
      setTimeout(() => setCopied({}), 2000);
    } catch (err) {
      toast({
        title: "Copy failed",
        description: "Failed to copy to clipboard",
        variant: "destructive"
      });
    }
  };

  const getMaskedValue = (value, isSecret) => {
    if (!isSecret) return value;
    return value ? '••••••••' : '';
  };

  const handleSave = () => {
    // Validate all variables
    const allErrors = {};
    let hasErrors = false;
    
    envVars.forEach(v => {
      const errors = validateVariable(v.key, v.value);
      if (errors.length > 0) {
        allErrors[v.id] = errors;
        hasErrors = true;
      }
    });
    
    setValidationErrors(allErrors);
    
    if (hasErrors) {
      toast({
        title: "Validation Error",
        description: "Please fix the errors before saving",
        variant: "destructive"
      });
      return;
    }
    
    if (onSave) {
      onSave(envVars);
    }
  };

  return (
    <div className="w-full space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">
          Environment Variables - {environment.charAt(0).toUpperCase() + environment.slice(1)}
        </h3>
        {!readOnly && (
          <Button onClick={handleAddVariable} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Add Variable
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {envVars.map((variable) => (
          <div key={variable.id} className="border rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-4">
                <label className="text-sm font-medium mb-1 block">Key</label>
                <Input
                  value={variable.key}
                  onChange={(e) => handleUpdateVariable(variable.id, 'key', e.target.value)}
                  placeholder="VARIABLE_NAME"
                  disabled={readOnly}
                  className={validationErrors[variable.id] ? 'border-red-500' : ''}
                />
              </div>
              
              <div className="col-span-5">
                <label className="text-sm font-medium mb-1 block">Value</label>
                <div className="relative">
                  <Input
                    type={variable.isSecret && !showValues[variable.id] ? 'password' : 'text'}
                    value={variable.isSecret && !showValues[variable.id] ? getMaskedValue(variable.value, true) : variable.value}
                    onChange={(e) => handleUpdateVariable(variable.id, 'value', e.target.value)}
                    placeholder="Value"
                    disabled={readOnly}
                    className={`pr-20 ${validationErrors[variable.id] ? 'border-red-500' : ''}`}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                    {variable.isSecret && (
                      <button
                        type="button"
                        onClick={() => toggleShowValue(variable.id)}
                        className="p-1 hover:bg-gray-100 rounded"
                      >
                        {showValues[variable.id] ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => copyToClipboard(`${variable.key}=${variable.value}`, variable.id)}
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      {copied[variable.id] ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="col-span-2 flex items-end justify-center">
                <div className="flex items-center space-x-2">
                  <label className="text-sm">Secret</label>
                  <Switch
                    checked={variable.isSecret}
                    onCheckedChange={(checked) => handleUpdateVariable(variable.id, 'isSecret', checked)}
                    disabled={readOnly}
                  />
                </div>
              </div>

              <div className="col-span-1 flex items-end justify-end">
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteVariable(variable.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="w-full">
              <label className="text-sm font-medium mb-1 block">Description</label>
              <Input
                value={variable.description || ''}
                onChange={(e) => handleUpdateVariable(variable.id, 'description', e.target.value)}
                placeholder="Optional description"
                disabled={readOnly}
              />
            </div>

            {validationErrors[variable.id] && (
              <div className="flex items-center gap-2 text-red-600 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>{validationErrors[variable.id].join(', ')}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {!readOnly && envVars.length > 0 && (
        <div className="flex justify-end mt-4">
          <Button onClick={handleSave}>
            Save Changes
          </Button>
        </div>
      )}
    </div>
  );
};

export default EnvironmentEditor;