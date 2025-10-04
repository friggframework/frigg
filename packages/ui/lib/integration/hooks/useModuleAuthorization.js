import { useState, useEffect, useCallback } from 'react';

/**
 * Hook for handling module authorization flows
 * Manages multi-step authorization state and recovery
 *
 * @param {string} moduleType - Module type to authorize
 * @param {object} api - API instance
 * @returns {object} - Authorization state and methods
 */
export function useModuleAuthorization(moduleType, api) {
  const [state, setState] = useState({
    step: 1,
    sessionId: null,
    credentialId: null,
    requirements: null,
    loading: false,
    error: null
  });

  // Check for recovery state on mount
  useEffect(() => {
    checkRecovery();
  }, [moduleType]);

  const checkRecovery = () => {
    const sessionId = localStorage.getItem(`auth_session_${moduleType}`);
    const credentialId = localStorage.getItem(`auth_credential_${moduleType}`);
    const step = localStorage.getItem(`auth_step_${moduleType}`);

    if (sessionId) {
      setState(prev => ({
        ...prev,
        sessionId,
        credentialId,
        step: parseInt(step, 10) || 1
      }));
    }
  };

  const loadRequirements = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const reqs = await api.getModuleAuthorizationRequirements(
        moduleType,
        state.step,
        state.sessionId
      );

      // Store session info
      if (reqs.sessionId && !state.sessionId) {
        localStorage.setItem(`auth_session_${moduleType}`, reqs.sessionId);
      }
      localStorage.setItem(`auth_step_${moduleType}`, state.step.toString());

      setState(prev => ({
        ...prev,
        requirements: reqs,
        sessionId: reqs.sessionId || prev.sessionId,
        loading: false
      }));

    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error.message,
        loading: false
      }));
    }
  }, [api, moduleType, state.step, state.sessionId]);

  const submitAuthorization = useCallback(async (data) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await api.submitModuleAuthorization(
        moduleType,
        data,
        state.step,
        state.sessionId,
        state.credentialId
      );

      if (result.completed) {
        // Clean up localStorage
        localStorage.removeItem(`auth_session_${moduleType}`);
        localStorage.removeItem(`auth_credential_${moduleType}`);
        localStorage.removeItem(`auth_step_${moduleType}`);

        setState(prev => ({ ...prev, loading: false }));
        return { completed: true, entity: result.entity };

      } else {
        // Multi-step: advance
        const credentialId = result.credentialId || state.credentialId;

        if (credentialId) {
          localStorage.setItem(`auth_credential_${moduleType}`, credentialId);
        }

        setState(prev => ({
          ...prev,
          step: result.step,
          sessionId: result.sessionId,
          credentialId,
          requirements: result.requirements,
          loading: false
        }));

        return { completed: false, step: result.step };
      }

    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error.message,
        loading: false
      }));
      throw error;
    }
  }, [api, moduleType, state.step, state.sessionId, state.credentialId]);

  const reset = useCallback(() => {
    localStorage.removeItem(`auth_session_${moduleType}`);
    localStorage.removeItem(`auth_credential_${moduleType}`);
    localStorage.removeItem(`auth_step_${moduleType}`);

    setState({
      step: 1,
      sessionId: null,
      credentialId: null,
      requirements: null,
      loading: false,
      error: null
    });
  }, [moduleType]);

  return {
    ...state,
    loadRequirements,
    submitAuthorization,
    reset
  };
}
