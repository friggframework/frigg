import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../Card';
import { Button } from '../Button';
import LoadingSpinner from '../LoadingSpinner';
import apiModuleService from '../../services/apiModuleService';

const APIModuleSelector = ({ onSelect, selectedModule }) => {
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModuleDetails, setSelectedModuleDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Fetch available modules on mount
  useEffect(() => {
    loadModules();
  }, []);

  // Load module details when selection changes
  useEffect(() => {
    if (selectedModule) {
      loadModuleDetails(selectedModule);
    }
  }, [selectedModule]);

  const loadModules = async () => {
    try {
      setLoading(true);
      setError(null);
      const availableModules = await apiModuleService.getAllModules();
      setModules(availableModules);
    } catch (err) {
      setError('Failed to load API modules. Please try again.');
      console.error('Error loading modules:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadModuleDetails = async (moduleName) => {
    try {
      setLoadingDetails(true);
      const details = await apiModuleService.getModuleDetails(moduleName);
      setSelectedModuleDetails(details);
    } catch (err) {
      console.error('Error loading module details:', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleModuleSelect = useCallback((module) => {
    onSelect(module);
  }, [onSelect]);

  const filteredModules = modules.filter(module => 
    module.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    module.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={loadModules}>Retry</Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-4">Select an API Module</h3>
        
        {/* Search Bar */}
        <div className="mb-4">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search API modules..."
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Module Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredModules.map((module) => (
            <Card
              key={module.name}
              className={`p-4 cursor-pointer transition-all ${
                selectedModule === module.name
                  ? 'ring-2 ring-blue-500 shadow-lg'
                  : 'hover:shadow-md'
              }`}
              onClick={() => handleModuleSelect(module.name)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900">{module.displayName}</h4>
                  <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                    {module.description || 'No description available'}
                  </p>
                  <div className="mt-2 flex items-center text-xs text-gray-500">
                    <span>v{module.version}</span>
                    {module.date && (
                      <>
                        <span className="mx-2">•</span>
                        <span>{new Date(module.date).toLocaleDateString()}</span>
                      </>
                    )}
                  </div>
                </div>
                {selectedModule === module.name && (
                  <div className="ml-2">
                    <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>

        {filteredModules.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No modules found matching "{searchTerm}"
          </div>
        )}
      </div>

      {/* Selected Module Details */}
      {selectedModule && selectedModuleDetails && (
        <Card className="p-6">
          <h4 className="text-lg font-semibold mb-4">Module Details</h4>
          
          {loadingDetails ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h5 className="font-medium text-gray-900">{selectedModuleDetails.displayName}</h5>
                <p className="text-sm text-gray-600 mt-1">{selectedModuleDetails.description}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="text-sm font-medium text-gray-700">Package:</span>
                  <p className="text-sm text-gray-900">{selectedModuleDetails.name}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-700">Version:</span>
                  <p className="text-sm text-gray-900">{selectedModuleDetails.version}</p>
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-700">Auth Type:</span>
                  <p className="text-sm text-gray-900 capitalize">{selectedModuleDetails.authType}</p>
                </div>
                {selectedModuleDetails.homepage && (
                  <div>
                    <span className="text-sm font-medium text-gray-700">Documentation:</span>
                    <a 
                      href={selectedModuleDetails.homepage} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline"
                    >
                      View Docs
                    </a>
                  </div>
                )}
              </div>

              {selectedModuleDetails.requiredFields && selectedModuleDetails.requiredFields.length > 0 && (
                <div>
                  <h5 className="font-medium text-gray-900 mb-2">Required Configuration</h5>
                  <div className="bg-gray-50 rounded-md p-3">
                    <ul className="space-y-1">
                      {selectedModuleDetails.requiredFields.map((field, index) => (
                        <li key={index} className="text-sm flex items-center justify-between">
                          <span className="font-medium">{field.label}</span>
                          <span className="text-gray-600">{field.type}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {selectedModuleDetails.keywords && selectedModuleDetails.keywords.length > 0 && (
                <div>
                  <h5 className="font-medium text-gray-900 mb-2">Tags</h5>
                  <div className="flex flex-wrap gap-2">
                    {selectedModuleDetails.keywords.map((keyword, index) => (
                      <span 
                        key={index}
                        className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded-md"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

export default APIModuleSelector;