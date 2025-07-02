/**
 * Framework-agnostic alerts service
 * Extracted from @friggframework/ui for multi-framework support
 */

export class AlertsService {
  constructor(apiService) {
    this.apiService = apiService;
    this.subscribers = new Map();
  }

  async getAlerts(integrationId, options = {}) {
    try {
      const params = {
        integrationId,
        severity: options.severity || 'all',
        status: options.status || 'all',
        limit: options.limit || 50,
        offset: options.offset || 0
      };

      const response = await this.apiService.post('/monitoring/alerts/list', params);
      return response.data || [];
    } catch (error) {
      console.error('Alerts fetch error:', error);
      throw error;
    }
  }

  async acknowledgeAlert(alertId, userId) {
    try {
      const response = await this.apiService.post(`/monitoring/alerts/${alertId}/acknowledge`, {
        userId,
        acknowledgedAt: new Date().toISOString()
      });
      return response.data;
    } catch (error) {
      console.error('Alert acknowledge error:', error);
      throw error;
    }
  }

  async resolveAlert(alertId, userId, resolution) {
    try {
      const response = await this.apiService.post(`/monitoring/alerts/${alertId}/resolve`, {
        userId,
        resolution,
        resolvedAt: new Date().toISOString()
      });
      return response.data;
    } catch (error) {
      console.error('Alert resolve error:', error);
      throw error;
    }
  }

  async createAlert(alertData) {
    try {
      const response = await this.apiService.post('/monitoring/alerts', {
        ...alertData,
        createdAt: new Date().toISOString()
      });
      return response.data;
    } catch (error) {
      console.error('Alert creation error:', error);
      throw error;
    }
  }

  async updateAlert(alertId, updates) {
    try {
      const response = await this.apiService.put(`/monitoring/alerts/${alertId}`, {
        ...updates,
        updatedAt: new Date().toISOString()
      });
      return response.data;
    } catch (error) {
      console.error('Alert update error:', error);
      throw error;
    }
  }

  async deleteAlert(alertId) {
    try {
      const response = await this.apiService.delete(`/monitoring/alerts/${alertId}`);
      return response.data;
    } catch (error) {
      console.error('Alert deletion error:', error);
      throw error;
    }
  }

  // Real-time alert subscription
  subscribe(integrationId, callback) {
    if (!this.subscribers.has(integrationId)) {
      this.subscribers.set(integrationId, new Set());
    }
    
    this.subscribers.get(integrationId).add(callback);
    
    // Return unsubscribe function
    return () => {
      const callbacks = this.subscribers.get(integrationId);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.subscribers.delete(integrationId);
        }
      }
    };
  }

  // Notify subscribers of new alerts
  notifySubscribers(integrationId, alert) {
    const callbacks = this.subscribers.get(integrationId);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(alert);
        } catch (error) {
          console.error('Alert notification error:', error);
        }
      });
    }
  }

  // Alert severity levels
  static SEVERITY = {
    CRITICAL: 'critical',
    HIGH: 'high',
    MEDIUM: 'medium',
    LOW: 'low',
    INFO: 'info'
  };

  // Alert status types
  static STATUS = {
    ACTIVE: 'active',
    ACKNOWLEDGED: 'acknowledged',
    RESOLVED: 'resolved',
    SUPPRESSED: 'suppressed'
  };

  // Helper methods
  filterAlertsBySeverity(alerts, severity) {
    return alerts.filter(alert => alert.severity === severity);
  }

  filterAlertsByStatus(alerts, status) {
    return alerts.filter(alert => alert.status === status);
  }

  getActiveAlertsCount(alerts) {
    return alerts.filter(alert => alert.status === AlertsService.STATUS.ACTIVE).length;
  }

  getCriticalAlertsCount(alerts) {
    return alerts.filter(alert => 
      alert.severity === AlertsService.SEVERITY.CRITICAL && 
      alert.status === AlertsService.STATUS.ACTIVE
    ).length;
  }

  groupAlertsBySeverity(alerts) {
    return alerts.reduce((groups, alert) => {
      const severity = alert.severity;
      if (!groups[severity]) {
        groups[severity] = [];
      }
      groups[severity].push(alert);
      return groups;
    }, {});
  }

  sortAlertsByTimestamp(alerts, order = 'desc') {
    return [...alerts].sort((a, b) => {
      const timeA = new Date(a.timestamp || a.createdAt);
      const timeB = new Date(b.timestamp || b.createdAt);
      return order === 'desc' ? timeB - timeA : timeA - timeB;
    });
  }
}