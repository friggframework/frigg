import { useState, useEffect } from 'react';
import { getIntegrations } from '../services/api';

export function useFrigg() {
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadIntegrations();
  }, []);

  const loadIntegrations = async () => {
    try {
      setLoading(true);
      const data = await getIntegrations();
      setIntegrations(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const refreshIntegrations = () => {
    loadIntegrations();
  };

  return {
    integrations,
    loading,
    error,
    refreshIntegrations,
  };
}