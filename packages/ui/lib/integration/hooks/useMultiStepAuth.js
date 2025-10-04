import { useState, useEffect, useCallback } from 'react';

/**
 * Hook for managing multi-step authentication state
 * Provides state management for wizard-style multi-step flows
 *
 * @param {object} initialRequirements - Initial authorization requirements
 * @returns {object} - Multi-step auth state and methods
 */
export function useMultiStepAuth(initialRequirements = null) {
  const [currentStep, setCurrentStep] = useState(1);
  const [totalSteps, setTotalSteps] = useState(1);
  const [sessionId, setSessionId] = useState(null);
  const [credentialId, setCredentialId] = useState(null);
  const [requirements, setRequirements] = useState(initialRequirements);
  const [formData, setFormData] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    if (initialRequirements) {
      setRequirements(initialRequirements);
      setCurrentStep(initialRequirements.step || 1);
      setTotalSteps(initialRequirements.totalSteps || 1);
      setSessionId(initialRequirements.sessionId || null);
    }
  }, [initialRequirements]);

  const updateStep = useCallback((stepData) => {
    if (stepData.step) setCurrentStep(stepData.step);
    if (stepData.totalSteps) setTotalSteps(stepData.totalSteps);
    if (stepData.sessionId) setSessionId(stepData.sessionId);
    if (stepData.credentialId) setCredentialId(stepData.credentialId);
    if (stepData.requirements) setRequirements(stepData.requirements);
  }, []);

  const updateFormData = useCallback((data) => {
    setFormData(data);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const setErrorMessage = useCallback((message) => {
    setError(message);
  }, []);

  const reset = useCallback(() => {
    setCurrentStep(1);
    setTotalSteps(1);
    setSessionId(null);
    setCredentialId(null);
    setRequirements(null);
    setFormData({});
    setError(null);
  }, []);

  const isMultiStep = totalSteps > 1;
  const isFirstStep = currentStep === 1;
  const isLastStep = currentStep === totalSteps;
  const progress = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;

  return {
    currentStep,
    totalSteps,
    sessionId,
    credentialId,
    requirements,
    formData,
    error,
    isMultiStep,
    isFirstStep,
    isLastStep,
    progress,
    updateStep,
    updateFormData,
    clearError,
    setErrorMessage,
    reset
  };
}
