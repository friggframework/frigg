import React, { useState, useCallback } from 'react';
import { Card } from '../Card';
import { Button } from '../Button';

const FIELD_TYPES = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'date', label: 'Date' },
  { value: 'array', label: 'Array' },
  { value: 'object', label: 'Object' },
  { value: 'json', label: 'JSON' }
];

const SchemaBuilder = ({ schema = [], onChange }) => {
  const [editingField, setEditingField] = useState(null);

  const handleAddField = useCallback(() => {
    const newField = {
      id: Date.now(),
      name: '',
      label: '',
      type: 'string',
      required: false,
      encrypted: false,
      default: '',
      validation: {}
    };
    onChange([...schema, newField]);
    setEditingField(newField.id);
  }, [schema, onChange]);

  const handleUpdateField = useCallback((id, updates) => {
    const updatedSchema = schema.map(field =>
      field.id === id ? { ...field, ...updates } : field
    );
    onChange(updatedSchema);
  }, [schema, onChange]);

  const handleRemoveField = useCallback((id) => {
    const updatedSchema = schema.filter(field => field.id !== id);
    onChange(updatedSchema);
    if (editingField === id) {
      setEditingField(null);
    }
  }, [schema, onChange, editingField]);

  const handleSaveField = useCallback(() => {
    setEditingField(null);
  }, []);

  const renderFieldEditor = (field) => {
    if (editingField !== field.id) {
      return (
        <div className="flex items-center justify-between p-4 border rounded-md">
          <div>
            <div className="font-medium">{field.label || field.name || 'Unnamed Field'}</div>
            <div className="text-sm text-gray-500">
              {field.type} {field.required && '• Required'} {field.encrypted && '• Encrypted'}
            </div>
          </div>
          <div className="flex space-x-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditingField(field.id)}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleRemoveField(field.id)}
              className="text-red-600 hover:text-red-700"
            >
              Remove
            </Button>
          </div>
        </div>
      );
    }

    return (
      <Card className="p-4">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Field Name *
              </label>
              <input
                type="text"
                value={field.name}
                onChange={(e) => handleUpdateField(field.id, { name: e.target.value })}
                placeholder="field_name"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Used in code (snake_case recommended)</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Display Label
              </label>
              <input
                type="text"
                value={field.label}
                onChange={(e) => handleUpdateField(field.id, { label: e.target.value })}
                placeholder="Field Label"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Human-readable label</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Type
              </label>
              <select
                value={field.type}
                onChange={(e) => handleUpdateField(field.id, { type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {FIELD_TYPES.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Default Value
              </label>
              <input
                type="text"
                value={field.default}
                onChange={(e) => handleUpdateField(field.id, { default: e.target.value })}
                placeholder="Optional default"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex flex-col justify-center space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) => handleUpdateField(field.id, { required: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-sm">Required</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={field.encrypted}
                  onChange={(e) => handleUpdateField(field.id, { encrypted: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-sm">Encrypted</span>
              </label>
            </div>
          </div>

          {(field.type === 'string' || field.type === 'number') && (
            <div className="bg-gray-50 p-4 rounded-md">
              <h4 className="font-medium text-gray-900 mb-3">Validation Rules</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {field.type === 'string' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Min Length
                      </label>
                      <input
                        type="number"
                        value={field.validation?.minLength || ''}
                        onChange={(e) => handleUpdateField(field.id, {
                          validation: { ...field.validation, minLength: parseInt(e.target.value) || undefined }
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Max Length
                      </label>
                      <input
                        type="number"
                        value={field.validation?.maxLength || ''}
                        onChange={(e) => handleUpdateField(field.id, {
                          validation: { ...field.validation, maxLength: parseInt(e.target.value) || undefined }
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Pattern (Regex)
                      </label>
                      <input
                        type="text"
                        value={field.validation?.pattern || ''}
                        onChange={(e) => handleUpdateField(field.id, {
                          validation: { ...field.validation, pattern: e.target.value || undefined }
                        })}
                        placeholder="^[a-zA-Z0-9]+$"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </>
                )}
                {field.type === 'number' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Minimum Value
                      </label>
                      <input
                        type="number"
                        value={field.validation?.min || ''}
                        onChange={(e) => handleUpdateField(field.id, {
                          validation: { ...field.validation, min: parseFloat(e.target.value) || undefined }
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Maximum Value
                      </label>
                      <input
                        type="number"
                        value={field.validation?.max || ''}
                        onChange={(e) => handleUpdateField(field.id, {
                          validation: { ...field.validation, max: parseFloat(e.target.value) || undefined }
                        })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => setEditingField(null)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveField}
              disabled={!field.name}
            >
              Save Field
            </Button>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="font-medium text-gray-900">Schema Fields</h4>
        <Button onClick={handleAddField}>Add Field</Button>
      </div>

      {schema.length === 0 && (
        <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-300 rounded-md">
          No custom fields defined. Click "Add Field" to create your first field.
        </div>
      )}

      <div className="space-y-3">
        {schema.map((field) => (
          <div key={field.id}>
            {renderFieldEditor(field)}
          </div>
        ))}
      </div>

      {schema.length > 0 && (
        <div className="bg-blue-50 p-4 rounded-md">
          <h5 className="font-medium text-blue-900 mb-2">Generated Schema Preview</h5>
          <pre className="text-sm text-blue-800 bg-blue-100 p-3 rounded overflow-x-auto">
{schema.map(field => {
  const validation = field.validation && Object.keys(field.validation).length > 0 ? `, validation: ${JSON.stringify(field.validation)}` : '';
  return `            ${field.name}: { type: '${field.type}', required: ${field.required}${field.encrypted ? ', encrypted: true' : ''}${field.default ? `, default: '${field.default}'` : ''}${validation} }`;
}).join(',\n')}
          </pre>
        </div>
      )}
    </div>
  );
};

export default SchemaBuilder;