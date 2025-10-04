import { useState, useCallback, useEffect } from 'react';

/**
 * Hook for credential management
 * Provides methods to list, test, and delete credentials
 *
 * @param {object} api - API instance with credential methods
 * @param {object} filters - Optional filters for listing credentials
 * @returns {object} - Credential state and methods
 */
export function useCredentials(api, filters = {}) {
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadCredentials = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await api.listCredentials(filters);
      setCredentials(result.credentials || []);
    } catch (err) {
      console.error('Failed to load credentials:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [api, filters]);

  const testCredential = useCallback(async (credentialId) => {
    try {
      const result = await api.testCredential(credentialId);

      // Update credential status in state
      setCredentials(prev => prev.map(cred =>
        cred.id === credentialId
          ? { ...cred, valid: result.valid, lastTested: new Date() }
          : cred
      ));

      return result;
    } catch (error) {
      console.error('Failed to test credential:', error);
      throw error;
    }
  }, [api]);

  const deleteCredential = useCallback(async (credentialId, cascade = false) => {
    try {
      await api.deleteCredential(credentialId, cascade);

      // Remove from state
      setCredentials(prev => prev.filter(cred => cred.id !== credentialId));
    } catch (error) {
      console.error('Failed to delete credential:', error);
      throw error;
    }
  }, [api]);

  const resumeFromCredential = useCallback(async (credentialId) => {
    try {
      const result = await api.resumeFromCredential(credentialId);
      return result;
    } catch (error) {
      console.error('Failed to resume from credential:', error);
      throw error;
    }
  }, [api]);

  // Auto-load on mount
  useEffect(() => {
    loadCredentials();
  }, [loadCredentials]);

  return {
    credentials,
    loading,
    error,
    loadCredentials,
    testCredential,
    deleteCredential,
    resumeFromCredential
  };
}
