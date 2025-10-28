import React, { useState, useCallback } from 'react';
import { Card } from '../Card';
import { Button } from '../Button';

const FORM_FIELD_TYPES = [
  { value: 'text', label: 'Text Input', icon: '📝' },
  { value: 'email', label: 'Email', icon: '📧' },
  { value: 'password', label: 'Password', icon: '🔒' },
  { value: 'number', label: 'Number', icon: '🔢' },
  { value: 'textarea', label: 'Text Area', icon: '📄' },
  { value: 'select', label: 'Select Dropdown', icon: '📋' },
  { value: 'checkbox', label: 'Checkbox', icon: '☑️' },
  { value: 'radio', label: 'Radio Button', icon: '◉' },
  { value: 'date', label: 'Date Picker', icon: '📅' },
  { value: 'file', label: 'File Upload', icon: '📎' },
  { value: 'url', label: 'URL Input', icon: '🔗' },
  { value: 'toggle', label: 'Toggle Switch', icon: '🔄' }
];

const VALIDATION_RULES = [
  { value: 'required', label: 'Required', hasValue: false },
  { value: 'minLength', label: 'Minimum Length', hasValue: true },
  { value: 'maxLength', label: 'Maximum Length', hasValue: true },
  { value: 'min', label: 'Minimum Value', hasValue: true },
  { value: 'max', label: 'Maximum Value', hasValue: true },
  { value: 'pattern', label: 'Regex Pattern', hasValue: true },
  { value: 'email', label: 'Email Format', hasValue: false },
  { value: 'url', label: 'URL Format', hasValue: false }
];

const FormBuilder = ({ fields = [], onChange, onGenerate }) => {
  const [editingField, setEditingField] = useState(null);
  const [previewMode, setPreviewMode] = useState(false);

  const handleAddField = useCallback(() => {
    const newField = {
      id: Date.now(),
      type: 'text',
      name: '',
      label: '',
      placeholder: '',
      required: false,
      validation: [],
      options: [],
      defaultValue: '',
      helpText: '',
      gridColumn: 1
    };
    const updatedFields = [...fields, newField];
    onChange(updatedFields);
    setEditingField(newField.id);
  }, [fields, onChange]);

  const handleUpdateField = useCallback((id, updates) => {
    const updatedFields = fields.map(field =>
      field.id === id ? { ...field, ...updates } : field
    );
    onChange(updatedFields);
  }, [fields, onChange]);

  const handleRemoveField = useCallback((id) => {
    const updatedFields = fields.filter(field => field.id !== id);
    onChange(updatedFields);
    if (editingField === id) {
      setEditingField(null);
    }
  }, [fields, onChange, editingField]);

  const handleMoveField = useCallback((id, direction) => {
    const currentIndex = fields.findIndex(field => field.id === id);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= fields.length) return;

    const updatedFields = [...fields];
    [updatedFields[currentIndex], updatedFields[newIndex]] = [updatedFields[newIndex], updatedFields[currentIndex]];
    onChange(updatedFields);
  }, [fields, onChange]);

  const addOption = useCallback((fieldId) => {
    const field = fields.find(f => f.id === fieldId);
    if (!field) return;

    const newOption = { value: '', label: '' };
    handleUpdateField(fieldId, {
      options: [...(field.options || []), newOption]
    });
  }, [fields, handleUpdateField]);

  const updateOption = useCallback((fieldId, optionIndex, updates) => {
    const field = fields.find(f => f.id === fieldId);
    if (!field) return;

    const updatedOptions = field.options.map((option, index) =>
      index === optionIndex ? { ...option, ...updates } : option
    );
    handleUpdateField(fieldId, { options: updatedOptions });
  }, [fields, handleUpdateField]);

  const removeOption = useCallback((fieldId, optionIndex) => {
    const field = fields.find(f => f.id === fieldId);
    if (!field) return;

    const updatedOptions = field.options.filter((_, index) => index !== optionIndex);
    handleUpdateField(fieldId, { options: updatedOptions });
  }, [fields, handleUpdateField]);

  const addValidationRule = useCallback((fieldId, rule) => {
    const field = fields.find(f => f.id === fieldId);
    if (!field) return;

    const newRule = { type: rule, value: rule === 'required' ? true : '' };
    handleUpdateField(fieldId, {
      validation: [...(field.validation || []), newRule]
    });
  }, [fields, handleUpdateField]);

  const updateValidationRule = useCallback((fieldId, ruleIndex, updates) => {
    const field = fields.find(f => f.id === fieldId);
    if (!field) return;

    const updatedRules = field.validation.map((rule, index) =>
      index === ruleIndex ? { ...rule, ...updates } : rule
    );
    handleUpdateField(fieldId, { validation: updatedRules });
  }, [fields, handleUpdateField]);

  const removeValidationRule = useCallback((fieldId, ruleIndex) => {
    const field = fields.find(f => f.id === fieldId);
    if (!field) return;

    const updatedRules = field.validation.filter((_, index) => index !== ruleIndex);
    handleUpdateField(fieldId, { validation: updatedRules });
  }, [fields, handleUpdateField]);

  const generateFormCode = useCallback(() => {
    const formComponent = `import React, { useState } from 'react';

const GeneratedForm = ({ onSubmit, initialData = {} }) => {
  const [formData, setFormData] = useState({
${fields.map(field => `    ${field.name}: initialData.${field.name} || '${field.defaultValue || ''}'`).join(',\n')}
  });

  const [errors, setErrors] = useState({});

  const handleChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const validate = () => {
    const newErrors = {};
${fields.filter(field => field.validation?.length > 0).map(field => {
  const validationCode = field.validation.map(rule => {
    switch (rule.type) {
      case 'required':
        return `    if (!formData.${field.name} || formData.${field.name}.toString().trim() === '') {
      newErrors.${field.name} = '${field.label} is required';
    }`;
      case 'minLength':
        return `    if (formData.${field.name} && formData.${field.name}.length < ${rule.value}) {
      newErrors.${field.name} = '${field.label} must be at least ${rule.value} characters';
    }`;
      case 'maxLength':
        return `    if (formData.${field.name} && formData.${field.name}.length > ${rule.value}) {
      newErrors.${field.name} = '${field.label} must be no more than ${rule.value} characters';
    }`;
      case 'email':
        return `    if (formData.${field.name} && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(formData.${field.name})) {
      newErrors.${field.name} = '${field.label} must be a valid email address';
    }`;
      case 'pattern':
        return `    if (formData.${field.name} && !/${rule.value}/.test(formData.${field.name})) {
      newErrors.${field.name} = '${field.label} format is invalid';
    }`;
      default:
        return '';
    }
  }).join('\n');
  return validationCode;
}).join('\n')}

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) {
      onSubmit(formData);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
${fields.map(field => generateFieldComponent(field)).join('\n')}
      </div>
      
      <div className="flex justify-end space-x-4">
        <button
          type="button"
          className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          onClick={() => setFormData({})}
        >
          Reset
        </button>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Submit
        </button>
      </div>
    </form>
  );
};

export default GeneratedForm;`;

    const metadata = {
      name: 'generated-form',
      type: 'form',
      files: [
        { name: 'GeneratedForm.jsx', content: formComponent },
        { name: 'form-schema.json', content: JSON.stringify(fields, null, 2) },
        { name: 'README.md', content: generateFormReadme() }
      ]
    };

    if (onGenerate) {
      onGenerate({ fields }, formComponent, metadata);
    }
  }, [fields, onGenerate]);

  const generateFieldComponent = (field) => {
    const colSpan = field.gridColumn === 2 ? 'md:col-span-2' : '';
    const errorDisplay = `{errors.${field.name} && <span className="text-red-500 text-sm">{errors.${field.name}}</span>}`;
    
    switch (field.type) {
      case 'textarea':
        return `        <div className="${colSpan}">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            ${field.label}${field.required ? ' *' : ''}
          </label>
          <textarea
            value={formData.${field.name}}
            onChange={(e) => handleChange('${field.name}', e.target.value)}
            placeholder="${field.placeholder}"
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          ${field.helpText ? `<p className="text-sm text-gray-500 mt-1">${field.helpText}</p>` : ''}
          ${errorDisplay}
        </div>`;

      case 'select':
        return `        <div className="${colSpan}">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            ${field.label}${field.required ? ' *' : ''}
          </label>
          <select
            value={formData.${field.name}}
            onChange={(e) => handleChange('${field.name}', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">${field.placeholder || 'Select an option'}</option>
${field.options?.map(option => `            <option value="${option.value}">${option.label}</option>`).join('\n') || ''}
          </select>
          ${field.helpText ? `<p className="text-sm text-gray-500 mt-1">${field.helpText}</p>` : ''}
          ${errorDisplay}
        </div>`;

      case 'checkbox':
        return `        <div className="${colSpan}">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={formData.${field.name}}
              onChange={(e) => handleChange('${field.name}', e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm font-medium text-gray-700">
              ${field.label}${field.required ? ' *' : ''}
            </span>
          </label>
          ${field.helpText ? `<p className="text-sm text-gray-500 mt-1">${field.helpText}</p>` : ''}
          ${errorDisplay}
        </div>`;

      case 'radio':
        return `        <div className="${colSpan}">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            ${field.label}${field.required ? ' *' : ''}
          </label>
          <div className="space-y-2">
${field.options?.map(option => `            <label className="flex items-center">
              <input
                type="radio"
                name="${field.name}"
                value="${option.value}"
                checked={formData.${field.name} === '${option.value}'}
                onChange={(e) => handleChange('${field.name}', e.target.value)}
                className="mr-2"
              />
              <span className="text-sm">${option.label}</span>
            </label>`).join('\n') || ''}
          </div>
          ${field.helpText ? `<p className="text-sm text-gray-500 mt-1">${field.helpText}</p>` : ''}
          ${errorDisplay}
        </div>`;

      default:
        return `        <div className="${colSpan}">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            ${field.label}${field.required ? ' *' : ''}
          </label>
          <input
            type="${field.type}"
            value={formData.${field.name}}
            onChange={(e) => handleChange('${field.name}', e.target.value)}
            placeholder="${field.placeholder}"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          ${field.helpText ? `<p className="text-sm text-gray-500 mt-1">${field.helpText}</p>` : ''}
          ${errorDisplay}
        </div>`;
    }
  };

  const generateFormReadme = () => {
    return `# Generated Form Component

This form was generated using the Frigg Form Builder.

## Fields

${fields.map(field => `- **${field.label}** (${field.type})${field.required ? ' - Required' : ''}
  ${field.helpText ? `  ${field.helpText}` : ''}`).join('\n')}

## Usage

\`\`\`jsx
import GeneratedForm from './GeneratedForm';

function MyComponent() {
  const handleSubmit = (formData) => {
    console.log('Form submitted:', formData);
  };

  return (
    <GeneratedForm 
      onSubmit={handleSubmit}
      initialData={{
        // Optional initial values
      }}
    />
  );
}
\`\`\`

## Customization

You can customize the styling by modifying the CSS classes in the component.
`;
  };

  const renderFieldPreview = (field) => {
    const commonProps = {
      className: "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500",
      disabled: true
    };

    switch (field.type) {
      case 'textarea':
        return <textarea {...commonProps} placeholder={field.placeholder} rows={3} />;
      case 'select':
        return (
          <select {...commonProps}>
            <option>{field.placeholder || 'Select an option'}</option>
            {field.options?.map((option, i) => (
              <option key={i} value={option.value}>{option.label}</option>
            ))}
          </select>
        );
      case 'checkbox':
        return (
          <label className="flex items-center">
            <input type="checkbox" disabled className="mr-2" />
            <span>{field.label}</span>
          </label>
        );
      case 'radio':
        return (
          <div className="space-y-2">
            {field.options?.map((option, i) => (
              <label key={i} className="flex items-center">
                <input type="radio" disabled className="mr-2" />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        );
      default:
        return <input {...commonProps} type={field.type} placeholder={field.placeholder} />;
    }
  };

  const renderFieldEditor = (field) => {
    if (editingField !== field.id) {
      return (
        <Card key={field.id} className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <span className="text-lg">
                {FORM_FIELD_TYPES.find(t => t.value === field.type)?.icon || '📝'}
              </span>
              <div>
                <h4 className="font-medium">{field.label || 'Unnamed Field'}</h4>
                <p className="text-sm text-gray-500">
                  {FORM_FIELD_TYPES.find(t => t.value === field.type)?.label} 
                  {field.required && ' • Required'}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleMoveField(field.id, 'up')}
                disabled={fields.indexOf(field) === 0}
              >
                ↑
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleMoveField(field.id, 'down')}
                disabled={fields.indexOf(field) === fields.length - 1}
              >
                ↓
              </Button>
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
                ×
              </Button>
            </div>
          </div>
          
          {/* Field Preview */}
          <div className="mt-3 p-3 bg-gray-50 rounded">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {field.label || 'Field Label'}{field.required && ' *'}
            </label>
            {renderFieldPreview(field)}
            {field.helpText && (
              <p className="text-sm text-gray-500 mt-1">{field.helpText}</p>
            )}
          </div>
        </Card>
      );
    }

    return (
      <Card key={field.id} className="p-6">
        <div className="space-y-4">
          {/* Basic Properties */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Field Type</label>
              <select
                value={field.type}
                onChange={(e) => handleUpdateField(field.id, { type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {FORM_FIELD_TYPES.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.icon} {type.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Field Name</label>
              <input
                type="text"
                value={field.name}
                onChange={(e) => handleUpdateField(field.id, { name: e.target.value })}
                placeholder="fieldName"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Label</label>
              <input
                type="text"
                value={field.label}
                onChange={(e) => handleUpdateField(field.id, { label: e.target.value })}
                placeholder="Field Label"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Placeholder</label>
              <input
                type="text"
                value={field.placeholder}
                onChange={(e) => handleUpdateField(field.id, { placeholder: e.target.value })}
                placeholder="Enter placeholder text"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Help Text</label>
              <input
                type="text"
                value={field.helpText}
                onChange={(e) => handleUpdateField(field.id, { helpText: e.target.value })}
                placeholder="Optional help text"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Grid Columns</label>
              <select
                value={field.gridColumn}
                onChange={(e) => handleUpdateField(field.id, { gridColumn: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={1}>1 Column</option>
                <option value={2}>2 Columns (Full Width)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(e) => handleUpdateField(field.id, { required: e.target.checked })}
              className="mr-2"
            />
            <label className="text-sm">Required Field</label>
          </div>

          {/* Options for select/radio */}
          {(field.type === 'select' || field.type === 'radio') && (
            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="block text-sm font-medium text-gray-700">Options</label>
                <Button size="sm" onClick={() => addOption(field.id)}>Add Option</Button>
              </div>
              <div className="space-y-2">
                {field.options?.map((option, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      value={option.value}
                      onChange={(e) => updateOption(field.id, index, { value: e.target.value })}
                      placeholder="Value"
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                    <input
                      type="text"
                      value={option.label}
                      onChange={(e) => updateOption(field.id, index, { label: e.target.value })}
                      placeholder="Label"
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => removeOption(field.id, index)}
                      className="text-red-600"
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Validation Rules */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="block text-sm font-medium text-gray-700">Validation Rules</label>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    addValidationRule(field.id, e.target.value);
                    e.target.value = '';
                  }
                }}
                className="text-sm px-2 py-1 border border-gray-300 rounded"
              >
                <option value="">Add Rule</option>
                {VALIDATION_RULES.map(rule => (
                  <option key={rule.value} value={rule.value}>{rule.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              {field.validation?.map((rule, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <span className="text-sm font-medium min-w-0 flex-shrink-0">
                    {VALIDATION_RULES.find(r => r.value === rule.type)?.label}:
                  </span>
                  {VALIDATION_RULES.find(r => r.value === rule.type)?.hasValue && (
                    <input
                      type="text"
                      value={rule.value}
                      onChange={(e) => updateValidationRule(field.id, index, { value: e.target.value })}
                      placeholder="Value"
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => removeValidationRule(field.id, index)}
                    className="text-red-600"
                  >
                    ×
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setEditingField(null)}>
              Done
            </Button>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Form Builder</h3>
        <div className="flex space-x-2">
          <div className="flex border rounded-md">
            <button
              onClick={() => setPreviewMode(false)}
              className={`px-3 py-1 text-sm ${!previewMode ? 'bg-blue-600 text-white' : 'text-gray-600'}`}
            >
              Builder
            </button>
            <button
              onClick={() => setPreviewMode(true)}
              className={`px-3 py-1 text-sm ${previewMode ? 'bg-blue-600 text-white' : 'text-gray-600'}`}
            >
              Preview
            </button>
          </div>
          <Button onClick={handleAddField}>Add Field</Button>
          {onGenerate && (
            <Button onClick={generateFormCode} className="bg-green-600 hover:bg-green-700">
              Generate Form
            </Button>
          )}
        </div>
      </div>

      {!previewMode ? (
        <div className="space-y-4">
          {fields.length === 0 && (
            <Card className="p-8">
              <div className="text-center text-gray-500">
                <svg className="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p>No form fields yet</p>
                <p className="text-sm mt-1">Click "Add Field" to start building your form</p>
              </div>
            </Card>
          )}
          
          {fields.map(renderFieldEditor)}
        </div>
      ) : (
        <Card className="p-6">
          <h4 className="text-lg font-medium mb-4">Form Preview</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {fields.map(field => (
              <div key={field.id} className={field.gridColumn === 2 ? 'md:col-span-2' : ''}>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {field.label || 'Field Label'}{field.required && ' *'}
                </label>
                {renderFieldPreview(field)}
                {field.helpText && (
                  <p className="text-sm text-gray-500 mt-1">{field.helpText}</p>
                )}
              </div>
            ))}
          </div>
          {fields.length > 0 && (
            <div className="flex justify-end space-x-4 mt-6 pt-6 border-t">
              <button className="px-4 py-2 border border-gray-300 rounded-md text-gray-700">
                Reset
              </button>
              <button className="px-4 py-2 bg-blue-600 text-white rounded-md">
                Submit
              </button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

export default FormBuilder;