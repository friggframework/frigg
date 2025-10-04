import { useState, useEffect, useCallback } from 'react';
import { JsonForms } from '@jsonforms/react';
import { materialRenderers, materialCells } from '@jsonforms/material-renderers';
import { Button } from '../components/button.jsx';
import { LoadingSpinner } from '../components/LoadingSpinner.jsx';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { useMultiStepAuth } from './hooks/useMultiStepAuth.js';

/**
 * MultiStepAuthWizard - Handles both single-step and multi-step authorization flows
 *
 * Supports:
 * - OAuth2 redirects
 * - Form-based authentication
 * - Selection steps
 * - Multi-step flows with progress tracking
 * - Session recovery via localStorage
 *
 * @param {object} api - API instance with module authorization methods
 * @param {string} moduleType - Module type to authorize (e.g., 'slack', 'hubspot')
 * @param {function} onSuccess - Callback when authorization completes
 * @param {function} onCancel - Callback when user cancels
 * @returns {JSX.Element}
 */
export default function MultiStepAuthWizard({ api, moduleType, onSuccess, onCancel, redirectContext }) {
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const {
    currentStep,
    totalSteps,
    sessionId,
    credentialId,
    requirements,
    formData,
    error,
    isMultiStep,
    progress,
    updateStep,
    updateFormData,
    clearError,
    setErrorMessage
  } = useMultiStepAuth();

  const initializeAuth = useCallback(async () => {
    if (initialized) {
      return;
    }

    try {
      setLoading(true);
      clearError();

      // Check for recovery state
      const savedSessionId = localStorage.getItem(`auth_session_${moduleType}`);
      const savedStep = localStorage.getItem(`auth_step_${moduleType}`);
      const savedCredentialId = localStorage.getItem(`auth_credential_${moduleType}`);

      const step = savedStep ? parseInt(savedStep, 10) : 1;

      const reqs = await api.getModuleAuthorizationRequirements(
        moduleType,
        step,
        savedSessionId,
        redirectContext  // Pass redirect context for OAuth state tracking
      );

      updateStep({
        step: reqs.step || step,
        totalSteps: reqs.totalSteps || 1,
        sessionId: reqs.sessionId || savedSessionId,
        credentialId: savedCredentialId,
        requirements: reqs
      });

      // Store session info for recovery
      if (reqs.sessionId) {
        localStorage.setItem(`auth_session_${moduleType}`, reqs.sessionId);
      }
      localStorage.setItem(`auth_step_${moduleType}`, (reqs.step || step).toString());

      setInitialized(true);

    } catch (err) {
      console.error('Failed to initialize auth:', err);
      setErrorMessage(err.message || 'Failed to load authentication requirements');
    } finally {
      setLoading(false);
    }
  }, [moduleType, api, redirectContext, clearError, updateStep, setErrorMessage, initialized]);

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  const handleSubmit = async (data) => {
    try {
      setLoading(true);
      clearError();

      const result = await api.submitModuleAuthorization(
        moduleType,
        data || formData,
        currentStep,
        sessionId,
        credentialId
      );

      if (result.completed) {
        // Success! Clean up localStorage
        localStorage.removeItem(`auth_session_${moduleType}`);
        localStorage.removeItem(`auth_credential_${moduleType}`);
        localStorage.removeItem(`auth_step_${moduleType}`);

        onSuccess(result.entity);
      } else {
        // Multi-step: advance to next step
        updateStep({
          step: result.step,
          totalSteps: result.totalSteps,
          sessionId: result.sessionId,
          credentialId: result.credentialId,
          requirements: result.requirements
        });

        // Update localStorage for recovery
        if (result.sessionId) {
          localStorage.setItem(`auth_session_${moduleType}`, result.sessionId);
        }
        if (result.credentialId) {
          localStorage.setItem(`auth_credential_${moduleType}`, result.credentialId);
        }
        localStorage.setItem(`auth_step_${moduleType}`, result.step.toString());

        // Pre-populate form data from previous step if applicable
        if (result.requirements?.data?.jsonSchema?.properties) {
          const nextFormData = {};
          Object.keys(result.requirements.data.jsonSchema.properties).forEach(key => {
            if (formData[key]) {
              nextFormData[key] = formData[key];
            }
          });
          updateFormData(nextFormData);
        }
      }
    } catch (err) {
      console.error('Auth step failed:', err);
      setErrorMessage(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    // Clean up localStorage
    localStorage.removeItem(`auth_session_${moduleType}`);
    localStorage.removeItem(`auth_credential_${moduleType}`);
    localStorage.removeItem(`auth_step_${moduleType}`);
    onCancel();
  };

  const handleOAuthRedirect = () => {
    const url = requirements?.url;
    if (url) {
      // Call OAuth redirect callback if provided (for state preservation)
      if (redirectContext?.onOAuthRedirect) {
        redirectContext.onOAuthRedirect();
      }

      // Store module type for OAuth callback
      localStorage.setItem(`oauth_module_type`, moduleType);
      window.location.href = url;
    } else {
      setErrorMessage('OAuth URL not found in authorization requirements');
    }
  };

  // Loading state
  if (loading && !requirements) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-3">
        <LoadingSpinner />
        <span className="text-sm text-gray-600">
          Loading authentication requirements...
        </span>
      </div>
    );
  }

  // Error state (no requirements loaded)
  if (error && !requirements) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-red-900 mb-2">
              Authentication Error
            </h3>
            <p className="text-sm text-red-800 mb-4">{error}</p>
            <div className="flex gap-2">
              <Button onClick={initializeAuth} variant="outline" size="sm">
                Retry
              </Button>
              <Button onClick={handleCancel} variant="outline" size="sm">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!requirements) {
    return null;
  }

  const isOAuth = requirements.type === 'oauth2';
  const isForm = requirements.type === 'form' || (requirements.data?.jsonSchema && requirements.type !== 'oauth2');
  const isSelection = requirements.type === 'selection';

  return (
    <div className="space-y-6">
      {/* Progress indicator for multi-step */}
      {isMultiStep && (
        <div className="space-y-2">
          <div className="flex justify-between items-center text-sm text-gray-600">
            <span>Step {currentStep} of {totalSteps}</span>
            <span className="font-medium">{Math.round(progress)}%</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Step content */}
      <div className="space-y-4">
        {/* Title and description */}
        <div>
          <h3 className="text-lg font-semibold">
            {requirements.data?.jsonSchema?.title || `Step ${currentStep}`}
          </h3>
          {requirements.data?.jsonSchema?.description && (
            <p className="text-sm text-gray-600 mt-1">
              {requirements.data.jsonSchema.description}
            </p>
          )}
        </div>

        {/* OAuth flow */}
        {isOAuth && (
          <div className="space-y-4 py-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                Click the button below to authorize through a secure OAuth connection.
                You'll be redirected to {moduleType} to grant access.
              </p>
            </div>
            <Button
              onClick={handleOAuthRedirect}
              className="w-full"
              disabled={loading}
            >
              Authorize with {moduleType}
            </Button>
          </div>
        )}

        {/* Form-based auth */}
        {isForm && requirements.data?.jsonSchema && (
          <div className="space-y-4">
            <JsonForms
              schema={requirements.data.jsonSchema}
              uischema={requirements.data.uischema || requirements.data.uiSchema || {}}
              data={formData}
              renderers={materialRenderers}
              cells={materialCells}
              onChange={({ data }) => updateFormData(data)}
            />
          </div>
        )}

        {/* Selection step */}
        {isSelection && requirements.data?.jsonSchema && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                Select from the available options below to continue.
              </p>
            </div>
            <JsonForms
              schema={requirements.data.jsonSchema}
              uischema={requirements.data.uischema || requirements.data.uiSchema || {}}
              data={formData}
              renderers={materialRenderers}
              cells={materialCells}
              onChange={({ data }) => updateFormData(data)}
            />
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
        <Button
          onClick={handleCancel}
          variant="outline"
          disabled={loading}
        >
          Cancel
        </Button>

        {!isOAuth && (
          <Button
            onClick={() => handleSubmit()}
            disabled={loading}
          >
            {loading ? (
              <>
                <LoadingSpinner />
                <span className="ml-2">Processing...</span>
              </>
            ) : (
              <>
                {currentStep === totalSteps ? (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Complete
                  </>
                ) : (
                  'Continue'
                )}
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
