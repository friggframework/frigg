/**
 * Svelte store for alerts management using ui-core AlertsService
 */

import { writable, derived, get } from 'svelte/store';
import { friggUICore } from '@friggframework/ui-core';

// Create the alerts store
function createAlertsStore() {
  const alertsService = friggUICore.getAlertsService();
  
  // Create a writable store for alerts
  const { subscribe, set, update } = writable([]);
  
  // Keep track of subscription
  let unsubscribe = null;
  
  // Initialize and subscribe to alerts service
  const init = async () => {
    try {
      // Get initial alerts
      const initialAlerts = await alertsService.getAlerts();
      set(initialAlerts);
      
      // Subscribe to updates (if service supports it)
      if (alertsService.subscribe) {
        unsubscribe = alertsService.subscribe((alerts) => {
          set(alerts);
        });
      }
    } catch (error) {
      console.error('Failed to initialize alerts store:', error);
      set([]);
    }
  };
  
  // Start initialization
  init();
  
  // Add a new alert
  const addAlert = async (alert) => {
    try {
      const newAlert = await alertsService.addAlert(alert);
      update(alerts => [...alerts, newAlert]);
      return newAlert;
    } catch (error) {
      console.error('Failed to add alert:', error);
      throw error;
    }
  };
  
  // Update an existing alert
  const updateAlert = async (alertId, updates) => {
    try {
      const updatedAlert = await alertsService.updateAlert(alertId, updates);
      update(alerts => 
        alerts.map(alert => alert.id === alertId ? updatedAlert : alert)
      );
      return updatedAlert;
    } catch (error) {
      console.error('Failed to update alert:', error);
      throw error;
    }
  };
  
  // Remove an alert
  const removeAlert = async (alertId) => {
    try {
      await alertsService.removeAlert(alertId);
      update(alerts => alerts.filter(alert => alert.id !== alertId));
    } catch (error) {
      console.error('Failed to remove alert:', error);
      throw error;
    }
  };
  
  // Dismiss an alert (mark as read/acknowledged)
  const dismissAlert = async (alertId) => {
    try {
      const dismissedAlert = await alertsService.dismissAlert(alertId);
      update(alerts => 
        alerts.map(alert => alert.id === alertId ? dismissedAlert : alert)
      );
      return dismissedAlert;
    } catch (error) {
      console.error('Failed to dismiss alert:', error);
      throw error;
    }
  };
  
  // Clear all alerts
  const clearAlerts = async () => {
    try {
      await alertsService.clearAlerts();
      set([]);
    } catch (error) {
      console.error('Failed to clear alerts:', error);
      throw error;
    }
  };
  
  // Refresh alerts from service
  const refresh = async () => {
    try {
      const alerts = await alertsService.getAlerts();
      set(alerts);
    } catch (error) {
      console.error('Failed to refresh alerts:', error);
      throw error;
    }
  };
  
  // Clean up subscription
  const destroy = () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };
  
  return {
    subscribe,
    addAlert,
    updateAlert,
    removeAlert,
    dismissAlert,
    clearAlerts,
    refresh,
    destroy
  };
}

// Export the alerts store instance
export const alertsStore = createAlertsStore();

// Create derived stores for different alert types
export const criticalAlerts = derived(
  alertsStore,
  $alerts => $alerts.filter(alert => alert.severity === 'critical')
);

export const warningAlerts = derived(
  alertsStore,
  $alerts => $alerts.filter(alert => alert.severity === 'warning')
);

export const infoAlerts = derived(
  alertsStore,
  $alerts => $alerts.filter(alert => alert.severity === 'info')
);

// Create derived store for unread alerts
export const unreadAlerts = derived(
  alertsStore,
  $alerts => $alerts.filter(alert => !alert.dismissed && !alert.read)
);

// Create derived store for alert count by severity
export const alertCounts = derived(
  alertsStore,
  $alerts => {
    const counts = {
      total: $alerts.length,
      critical: 0,
      warning: 0,
      info: 0,
      unread: 0
    };
    
    $alerts.forEach(alert => {
      if (alert.severity === 'critical') counts.critical++;
      else if (alert.severity === 'warning') counts.warning++;
      else if (alert.severity === 'info') counts.info++;
      
      if (!alert.dismissed && !alert.read) counts.unread++;
    });
    
    return counts;
  }
);

// Helper function to create alert with defaults
export function createAlert(options) {
  return {
    id: options.id || Date.now().toString(),
    title: options.title || 'Alert',
    message: options.message || '',
    severity: options.severity || 'info',
    timestamp: options.timestamp || new Date().toISOString(),
    dismissed: options.dismissed || false,
    read: options.read || false,
    metadata: options.metadata || {},
    ...options
  };
}