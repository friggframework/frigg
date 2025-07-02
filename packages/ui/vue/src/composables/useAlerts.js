/**
 * Vue composable for alerts management using ui-core AlertsService
 */

import { ref, computed, onMounted, onUnmounted } from 'vue';
import { friggUICore } from '@friggframework/ui-core';

export function useAlerts(integrationId = null) {
  const alerts = ref([]);
  const loading = ref(false);
  const error = ref(null);
  
  const alertsService = friggUICore.getAlertsService();
  let unsubscribe = null;

  const isLoading = computed(() => loading.value);
  const hasError = computed(() => error.value !== null);
  const activeAlerts = computed(() => 
    alerts.value.filter(alert => alert.status === 'active')
  );
  const criticalAlerts = computed(() => 
    alerts.value.filter(alert => 
      alert.severity === 'critical' && alert.status === 'active'
    )
  );

  // Generic request wrapper
  const makeRequest = async (requestFn) => {
    loading.value = true;
    error.value = null;
    
    try {
      const result = await requestFn();
      return result;
    } catch (err) {
      error.value = err;
      throw err;
    } finally {
      loading.value = false;
    }
  };

  // Fetch alerts for integration
  const fetchAlerts = async (options = {}) => {
    if (!integrationId) {
      console.warn('No integrationId provided for fetchAlerts');
      return [];
    }

    return makeRequest(async () => {
      const result = await alertsService.getAlerts(integrationId, options);
      alerts.value = result;
      return result;
    });
  };

  // Acknowledge alert
  const acknowledgeAlert = async (alertId, userId) => {
    return makeRequest(async () => {
      const result = await alertsService.acknowledgeAlert(alertId, userId);
      // Update local alert state
      const alertIndex = alerts.value.findIndex(alert => alert.id === alertId);
      if (alertIndex !== -1) {
        alerts.value[alertIndex] = { ...alerts.value[alertIndex], ...result };
      }
      return result;
    });
  };

  // Resolve alert
  const resolveAlert = async (alertId, userId, resolution) => {
    return makeRequest(async () => {
      const result = await alertsService.resolveAlert(alertId, userId, resolution);
      // Update local alert state
      const alertIndex = alerts.value.findIndex(alert => alert.id === alertId);
      if (alertIndex !== -1) {
        alerts.value[alertIndex] = { ...alerts.value[alertIndex], ...result };
      }
      return result;
    });
  };

  // Create new alert
  const createAlert = async (alertData) => {
    return makeRequest(async () => {
      const result = await alertsService.createAlert(alertData);
      // Add to local alerts
      alerts.value.unshift(result);
      return result;
    });
  };

  // Update alert
  const updateAlert = async (alertId, updates) => {
    return makeRequest(async () => {
      const result = await alertsService.updateAlert(alertId, updates);
      // Update local alert state
      const alertIndex = alerts.value.findIndex(alert => alert.id === alertId);
      if (alertIndex !== -1) {
        alerts.value[alertIndex] = { ...alerts.value[alertIndex], ...result };
      }
      return result;
    });
  };

  // Delete alert
  const deleteAlert = async (alertId) => {
    return makeRequest(async () => {
      const result = await alertsService.deleteAlert(alertId);
      // Remove from local alerts
      alerts.value = alerts.value.filter(alert => alert.id !== alertId);
      return result;
    });
  };

  // Filter utilities
  const filterBySeverity = (severity) => {
    return alerts.value.filter(alert => alert.severity === severity);
  };

  const filterByStatus = (status) => {
    return alerts.value.filter(alert => alert.status === status);
  };

  const groupBySeverity = () => {
    return alertsService.groupAlertsBySeverity(alerts.value);
  };

  const sortByTimestamp = (order = 'desc') => {
    return alertsService.sortAlertsByTimestamp(alerts.value, order);
  };

  // Real-time subscription
  const subscribeToAlerts = () => {
    if (integrationId && !unsubscribe) {
      unsubscribe = alertsService.subscribe(integrationId, (newAlert) => {
        // Add new alert to the beginning of the list
        alerts.value.unshift(newAlert);
      });
    }
  };

  // Initialize and cleanup
  onMounted(() => {
    if (integrationId) {
      fetchAlerts();
      subscribeToAlerts();
    }
  });

  onUnmounted(() => {
    if (unsubscribe) {
      unsubscribe();
    }
  });

  // Clear error state
  const clearError = () => {
    error.value = null;
  };

  return {
    // State
    alerts,
    loading: isLoading,
    error,
    hasError,
    activeAlerts,
    criticalAlerts,
    
    // Actions
    fetchAlerts,
    acknowledgeAlert,
    resolveAlert,
    createAlert,
    updateAlert,
    deleteAlert,
    
    // Utilities
    filterBySeverity,
    filterByStatus,
    groupBySeverity,
    sortByTimestamp,
    subscribeToAlerts,
    clearError,
    
    // Constants
    SEVERITY: alertsService.constructor.SEVERITY,
    STATUS: alertsService.constructor.STATUS
  };
}