import { useState, useEffect, useCallback } from 'react';
import { alertsService } from '../services/alertsService';

export const useAlerts = ({ integrationId, config = {} }) => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAlerts = useCallback(async () => {
    if (!integrationId) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const alertsData = await alertsService.getAlerts({
        integrationId,
        config
      });
      
      setAlerts(alertsData);
    } catch (err) {
      console.error('Error fetching alerts:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [integrationId, config]);

  const createAlert = useCallback(async (alertConfig) => {
    if (!integrationId) return;
    
    try {
      const newAlert = await alertsService.createAlert({
        integrationId,
        ...alertConfig,
        config
      });
      
      setAlerts(prev => [...prev, newAlert]);
      return newAlert;
    } catch (err) {
      console.error('Error creating alert:', err);
      throw err;
    }
  }, [integrationId, config]);

  const updateAlert = useCallback(async (alertId, updates) => {
    try {
      const updatedAlert = await alertsService.updateAlert({
        integrationId,
        alertId,
        updates,
        config
      });
      
      setAlerts(prev => prev.map(alert => 
        alert.id === alertId ? updatedAlert : alert
      ));
      
      return updatedAlert;
    } catch (err) {
      console.error('Error updating alert:', err);
      throw err;
    }
  }, [integrationId, config]);

  const deleteAlert = useCallback(async (alertId) => {
    try {
      await alertsService.deleteAlert({
        integrationId,
        alertId,
        config
      });
      
      setAlerts(prev => prev.filter(alert => alert.id !== alertId));
    } catch (err) {
      console.error('Error deleting alert:', err);
      throw err;
    }
  }, [integrationId, config]);

  const acknowledgeAlert = useCallback(async (alertId) => {
    try {
      const acknowledgedAlert = await alertsService.acknowledgeAlert({
        integrationId,
        alertId,
        config
      });
      
      setAlerts(prev => prev.map(alert => 
        alert.id === alertId 
          ? { 
              ...alert, 
              status: 'acknowledged', 
              acknowledgedAt: new Date().toISOString() 
            }
          : alert
      ));
      
      return acknowledgedAlert;
    } catch (err) {
      console.error('Error acknowledging alert:', err);
      throw err;
    }
  }, [integrationId, config]);

  const testAlert = useCallback(async (alertId) => {
    try {
      const result = await alertsService.testAlert({
        integrationId,
        alertId,
        config
      });
      
      return result;
    } catch (err) {
      console.error('Error testing alert:', err);
      throw err;
    }
  }, [integrationId, config]);

  // Subscribe to real-time alert updates
  useEffect(() => {
    if (!integrationId) return;
    
    const subscription = alertsService.subscribeToAlerts({
      integrationId,
      config,
      onAlert: (alert) => {
        setAlerts(prev => {
          const existing = prev.find(a => a.id === alert.id);
          if (existing) {
            return prev.map(a => a.id === alert.id ? alert : a);
          }
          return [...prev, alert];
        });
      },
      onError: (err) => {
        console.error('Alert subscription error:', err);
        setError(err);
      }
    });
    
    return () => {
      if (subscription) {
        alertsService.unsubscribe(subscription);
      }
    };
  }, [integrationId, config]);

  // Initial fetch
  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  return {
    alerts,
    loading,
    error,
    createAlert,
    updateAlert,
    deleteAlert,
    acknowledgeAlert,
    testAlert,
    refresh: fetchAlerts
  };
};