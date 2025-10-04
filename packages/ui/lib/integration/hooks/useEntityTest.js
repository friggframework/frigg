import { useState, useCallback } from 'react';

/**
 * Hook for testing entity connections
 * Provides methods to test entities and track their test status
 *
 * @param {object} api - API instance with testEntity method
 * @returns {object} - { testEntity, testing, results }
 */
export function useEntityTest(api) {
  const [testing, setTesting] = useState({});
  const [results, setResults] = useState({});

  const testEntity = useCallback(async (entityId) => {
    setTesting(prev => ({ ...prev, [entityId]: true }));

    try {
      const result = await api.testEntity(entityId);

      setResults(prev => ({
        ...prev,
        [entityId]: {
          valid: result.valid,
          message: result.valid ? 'Connected' : result.error,
          canReauthorize: result.canReauthorize,
          lastTested: new Date()
        }
      }));

      return result;
    } catch (error) {
      setResults(prev => ({
        ...prev,
        [entityId]: {
          valid: false,
          message: 'Test failed',
          error: error.message,
          lastTested: new Date()
        }
      }));
      throw error;
    } finally {
      setTesting(prev => ({ ...prev, [entityId]: false }));
    }
  }, [api]);

  return {
    testEntity,
    testing,
    results
  };
}
