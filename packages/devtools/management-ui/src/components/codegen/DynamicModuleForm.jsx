import React, { useState, useEffect } from 'react';
import { Card } from '../Card';
import { Button } from '../Button';

const DynamicModuleForm = ({ moduleDetails, onSubmit, initialValues = {} }) => {
  const [formValues, setFormValues] = useState(initialValues);
  const [errors, setErrors] = useState({});

  // Initialize form values when module details change
  useEffect(() => {
    if (moduleDetails?.requiredFields) {
      const defaultValues = {};
      moduleDetails.requiredFields.forEach(field => {
        defaultValues[field.name] = initialValues[field.name] || field.default || '';
      });
      setFormValues(prev => ({ ...defaultValues, ...prev }));
    }
  }, [moduleDetails, initialValues]);

  const handleInputChange = (fieldName, value) => {
    setFormValues(prev => ({
      ...prev,
      [fieldName]: value
    }));
    
    // Clear error for this field
    if (errors[fieldName]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldName];
        return newErrors;
      });
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!moduleDetails?.requiredFields) return true;

    moduleDetails.requiredFields.forEach(field => {
      if (field.required && !formValues[field.name]) {
        newErrors[field.name] = `${field.label} is required`;
      }
      
      // Additional validation based on field type
      if (formValues[field.name]) {
        switch (field.type) {
          case 'url':
            if (!isValidUrl(formValues[field.name])) {
              newErrors[field.name] = `${field.label} must be a valid URL`;
            }
            break;
          case 'email':
            if (!isValidEmail(formValues[field.name])) {
              newErrors[field.name] = `${field.label} must be a valid email`;
            }
            break;
          case 'number':
            if (isNaN(formValues[field.name])) {
              newErrors[field.name] = `${field.label} must be a number`;
            }
            break;
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validateForm()) {
      onSubmit(formValues);
    }
  };

  const isValidUrl = (string) => {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  };

  const isValidEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const renderField = (field) => {
    const fieldId = `field-${field.name}`;
    const hasError = !!errors[field.name];

    switch (field.type) {
      case 'password':
        return (
          <div key={field.name} className="space-y-2">
            <label htmlFor={fieldId} className="block text-sm font-medium text-gray-700">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
            <input
              id={fieldId}
              type="password"
              value={formValues[field.name] || ''}
              onChange={(e) => handleInputChange(field.name, e.target.value)}
              placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                hasError 
                  ? 'border-red-300 focus:ring-red-500' 
                  : 'border-gray-300 focus:ring-blue-500'
              }`}
            />
            {hasError && (
              <p className="text-sm text-red-600">{errors[field.name]}</p>
            )}
            {field.hint && (
              <p className="text-sm text-gray-500">{field.hint}</p>
            )}
          </div>
        );

      case 'select':
        return (
          <div key={field.name} className="space-y-2">
            <label htmlFor={fieldId} className="block text-sm font-medium text-gray-700">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
            <select
              id={fieldId}
              value={formValues[field.name] || ''}
              onChange={(e) => handleInputChange(field.name, e.target.value)}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                hasError 
                  ? 'border-red-300 focus:ring-red-500' 
                  : 'border-gray-300 focus:ring-blue-500'
              }`}
            >
              <option value="">Select {field.label}</option>
              {field.options?.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {hasError && (
              <p className="text-sm text-red-600">{errors[field.name]}</p>
            )}
          </div>
        );

      case 'boolean':
        return (
          <div key={field.name} className="space-y-2">
            <label className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={formValues[field.name] || false}
                onChange={(e) => handleInputChange(field.name, e.target.checked)}
                className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </span>
            </label>
            {field.hint && (
              <p className="text-sm text-gray-500 ml-7">{field.hint}</p>
            )}
          </div>
        );

      case 'textarea':
        return (
          <div key={field.name} className="space-y-2">
            <label htmlFor={fieldId} className="block text-sm font-medium text-gray-700">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
            <textarea
              id={fieldId}
              value={formValues[field.name] || ''}
              onChange={(e) => handleInputChange(field.name, e.target.value)}
              placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
              rows={field.rows || 3}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                hasError 
                  ? 'border-red-300 focus:ring-red-500' 
                  : 'border-gray-300 focus:ring-blue-500'
              }`}
            />
            {hasError && (
              <p className="text-sm text-red-600">{errors[field.name]}</p>
            )}
          </div>
        );

      default:
        return (
          <div key={field.name} className="space-y-2">
            <label htmlFor={fieldId} className="block text-sm font-medium text-gray-700">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
            <input
              id={fieldId}
              type={field.type || 'text'}
              value={formValues[field.name] || ''}
              onChange={(e) => handleInputChange(field.name, e.target.value)}
              placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                hasError 
                  ? 'border-red-300 focus:ring-red-500' 
                  : 'border-gray-300 focus:ring-blue-500'
              }`}
            />
            {hasError && (
              <p className="text-sm text-red-600">{errors[field.name]}</p>
            )}
            {field.hint && (
              <p className="text-sm text-gray-500">{field.hint}</p>
            )}
          </div>
        );
    }
  };

  if (!moduleDetails) {
    return (
      <Card className="p-6">
        <p className="text-gray-500 text-center">No module selected</p>
      </Card>
    );
  }

  const requiredFields = moduleDetails.requiredFields || [];
  const optionalFields = moduleDetails.optionalFields || [];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {requiredFields.length > 0 && (
        <div>
          <h4 className="text-lg font-medium text-gray-900 mb-4">Required Configuration</h4>
          <div className="space-y-4">
            {requiredFields.map(field => renderField(field))}
          </div>
        </div>
      )}

      {optionalFields.length > 0 && (
        <div>
          <h4 className="text-lg font-medium text-gray-900 mb-4">Optional Configuration</h4>
          <div className="space-y-4">
            {optionalFields.map(field => renderField(field))}
          </div>
        </div>
      )}

      <div className="flex justify-end space-x-3">
        <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
          Generate Configuration
        </Button>
      </div>
    </form>
  );
};

export default DynamicModuleForm;