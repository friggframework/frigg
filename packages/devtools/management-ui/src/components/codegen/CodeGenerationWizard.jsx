import React, { useState, useCallback } from 'react';
import { Card } from '../Card';
import { Button } from '../Button';
import TemplateSelector from './TemplateSelector';
import IntegrationGenerator from './IntegrationGenerator';
import APIEndpointGenerator from './APIEndpointGenerator';
import ProjectScaffoldWizard from './ProjectScaffoldWizard';
import CodePreviewEditor from './CodePreviewEditor';

const GENERATION_TYPES = {
  API_MODULE: 'api-module',
  API_ENDPOINT: 'api-endpoint',
  PROJECT_SCAFFOLD: 'project-scaffold',
  CUSTOM: 'custom'
};

const CodeGenerationWizard = () => {
  const [currentStep, setCurrentStep] = useState('select-type');
  const [generationType, setGenerationType] = useState(null);
  const [generatedCode, setGeneratedCode] = useState(null);
  const [metadata, setMetadata] = useState({});

  const steps = [
    { id: 'select-type', title: 'Select Generation Type' },
    { id: 'configure', title: 'Configure Options' },
    { id: 'preview', title: 'Preview & Edit' },
    { id: 'generate', title: 'Generate Files' }
  ];

  const handleTypeSelection = useCallback((type) => {
    setGenerationType(type);
    setCurrentStep('configure');
  }, []);

  const handleConfiguration = useCallback((config, code, meta) => {
    setGeneratedCode(code);
    setMetadata(meta);
    setCurrentStep('preview');
  }, []);

  const handleCodeUpdate = useCallback((updatedCode) => {
    setGeneratedCode(updatedCode);
  }, []);

  const handleGenerate = useCallback(async () => {
    try {
      const response = await fetch('/api/codegen/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: generationType,
          code: generatedCode,
          metadata
        }),
      });

      if (response.ok) {
        const result = await response.json();
        alert(`Code generated successfully! Files created: ${result.files.join(', ')}`);
        setCurrentStep('select-type');
        setGenerationType(null);
        setGeneratedCode(null);
        setMetadata({});
      } else {
        throw new Error('Failed to generate code');
      }
    } catch (error) {
      console.error('Generation error:', error);
      alert('Failed to generate code. Please try again.');
    }
  }, [generationType, generatedCode, metadata]);

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center mb-8">
      {steps.map((step, index) => (
        <React.Fragment key={step.id}>
          <div className={`flex items-center ${
            step.id === currentStep 
              ? 'text-blue-600' 
              : steps.findIndex(s => s.id === currentStep) > index
                ? 'text-green-600'
                : 'text-gray-400'
          }`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
              step.id === currentStep
                ? 'border-blue-600 bg-blue-50'
                : steps.findIndex(s => s.id === currentStep) > index
                  ? 'border-green-600 bg-green-50'
                  : 'border-gray-300 bg-gray-50'
            }`}>
              {steps.findIndex(s => s.id === currentStep) > index ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                <span className="text-sm font-medium">{index + 1}</span>
              )}
            </div>
            <span className="ml-2 text-sm font-medium">{step.title}</span>
          </div>
          {index < steps.length - 1 && (
            <div className="w-16 h-px bg-gray-300 mx-4" />
          )}
        </React.Fragment>
      ))}
    </div>
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'select-type':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-center mb-8">What would you like to generate?</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card 
                className="cursor-pointer hover:shadow-lg transition-shadow p-6"
                onClick={() => handleTypeSelection(GENERATION_TYPES.API_MODULE)}
              >
                <div className="text-center">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold mb-2">API Module</h3>
                  <p className="text-gray-600">Generate an API wrapper class for external service communication with authentication and credential storage</p>
                </div>
              </Card>

              <Card 
                className="cursor-pointer hover:shadow-lg transition-shadow p-6"
                onClick={() => handleTypeSelection(GENERATION_TYPES.API_ENDPOINT)}
              >
                <div className="text-center">
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold mb-2">API Endpoints</h3>
                  <p className="text-gray-600">Create REST API endpoints with schemas, validation, and documentation</p>
                </div>
              </Card>

              <Card 
                className="cursor-pointer hover:shadow-lg transition-shadow p-6"
                onClick={() => handleTypeSelection(GENERATION_TYPES.PROJECT_SCAFFOLD)}
              >
                <div className="text-center">
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Project Scaffold</h3>
                  <p className="text-gray-600">Create a complete Frigg backend project with integrations and configuration</p>
                </div>
              </Card>

              <Card 
                className="cursor-pointer hover:shadow-lg transition-shadow p-6"
                onClick={() => handleTypeSelection(GENERATION_TYPES.CUSTOM)}
              >
                <div className="text-center">
                  <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Custom Template</h3>
                  <p className="text-gray-600">Use custom templates or modify existing ones to fit your specific needs</p>
                </div>
              </Card>
            </div>
          </div>
        );

      case 'configure':
        return (
          <div>
            {generationType === GENERATION_TYPES.API_MODULE && (
              <IntegrationGenerator onGenerate={handleConfiguration} />
            )}
            {generationType === GENERATION_TYPES.API_ENDPOINT && (
              <APIEndpointGenerator onGenerate={handleConfiguration} />
            )}
            {generationType === GENERATION_TYPES.PROJECT_SCAFFOLD && (
              <ProjectScaffoldWizard onGenerate={handleConfiguration} />
            )}
            {generationType === GENERATION_TYPES.CUSTOM && (
              <TemplateSelector onGenerate={handleConfiguration} />
            )}
          </div>
        );

      case 'preview':
        return (
          <div>
            <h2 className="text-2xl font-bold mb-6">Preview & Edit Generated Code</h2>
            <CodePreviewEditor 
              code={generatedCode}
              metadata={metadata}
              onChange={handleCodeUpdate}
            />
            <div className="flex justify-between mt-6">
              <Button 
                variant="outline"
                onClick={() => setCurrentStep('configure')}
              >
                Back to Configuration
              </Button>
              <Button 
                onClick={handleGenerate}
                className="bg-green-600 hover:bg-green-700"
              >
                Generate Files
              </Button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-center mb-2">Code Generation Wizard</h1>
        <p className="text-gray-600 text-center">Generate integrations, APIs, and scaffolds with visual tools</p>
      </div>

      {renderStepIndicator()}
      
      <Card className="p-8">
        {renderCurrentStep()}
      </Card>
    </div>
  );
};

export default CodeGenerationWizard;