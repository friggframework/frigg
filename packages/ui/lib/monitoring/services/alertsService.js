import { apiService } from './apiService';

export const alertsService = {
  async getAlerts({ integrationId, config }) {
    try {
      const response = await apiService.get('/monitoring/alerts', {
        params: {
          integrationId,
          region: config.region || 'us-east-1'
        }
      });
      
      return response.data.alerts;
    } catch (error) {
      console.error('Error fetching alerts:', error);
      
      // Return mock alerts for development
      return generateMockAlerts();
    }
  },

  async createAlert({ integrationId, name, metric, condition, threshold, duration, severity, config }) {
    try {
      const response = await apiService.post('/monitoring/alerts', {
        integrationId,
        name,
        metric,
        condition,
        threshold,
        duration,
        severity,
        region: config.region || 'us-east-1',
        actions: config.alertActions || []
      });
      
      return response.data.alert;
    } catch (error) {
      console.error('Error creating alert:', error);
      
      // Return mock alert for development
      return {
        id: `alert_${Date.now()}`,
        name,
        metric,
        condition,
        threshold,
        duration,
        severity,
        status: 'active',
        createdAt: new Date().toISOString(),
        lastTriggered: null
      };
    }
  },

  async updateAlert({ integrationId, alertId, updates, config }) {
    try {
      const response = await apiService.put(`/monitoring/alerts/${alertId}`, {
        integrationId,
        ...updates,
        region: config.region || 'us-east-1'
      });
      
      return response.data.alert;
    } catch (error) {
      console.error('Error updating alert:', error);
      throw error;
    }
  },

  async deleteAlert({ integrationId, alertId, config }) {
    try {
      await apiService.delete(`/monitoring/alerts/${alertId}`, {
        params: {
          integrationId,
          region: config.region || 'us-east-1'
        }
      });
    } catch (error) {
      console.error('Error deleting alert:', error);
      throw error;
    }
  },

  async acknowledgeAlert({ integrationId, alertId, config }) {
    try {
      const response = await apiService.post(`/monitoring/alerts/${alertId}/acknowledge`, {
        integrationId,
        acknowledgedBy: config.userId || 'user',
        region: config.region || 'us-east-1'
      });
      
      return response.data.alert;
    } catch (error) {
      console.error('Error acknowledging alert:', error);
      
      // Return mock acknowledgment for development
      return {
        id: alertId,
        status: 'acknowledged',
        acknowledgedAt: new Date().toISOString(),
        acknowledgedBy: config.userId || 'user'
      };
    }
  },

  async testAlert({ integrationId, alertId, config }) {
    try {
      const response = await apiService.post(`/monitoring/alerts/${alertId}/test`, {
        integrationId,
        region: config.region || 'us-east-1'
      });
      
      return response.data.result;
    } catch (error) {
      console.error('Error testing alert:', error);
      throw error;
    }
  },

  subscribeToAlerts({ integrationId, config, onAlert, onError }) {
    try {
      // WebSocket subscription for real-time alerts
      const wsUrl = `${apiService.getWebSocketUrl()}/monitoring/alerts/subscribe`;
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        ws.send(JSON.stringify({
          action: 'subscribe',
          integrationId,
          region: config.region || 'us-east-1'
        }));
      };
      
      ws.onmessage = (event) => {
        try {
          const alert = JSON.parse(event.data);
          onAlert(alert);
        } catch (err) {
          console.error('Error parsing alert message:', err);
        }
      };
      
      ws.onerror = (error) => {
        onError(error);
      };
      
      return ws;
    } catch (error) {
      console.error('Error subscribing to alerts:', error);
      
      // Fallback to mock subscription for development
      return startMockAlertStream(onAlert);
    }
  },

  unsubscribe(subscription) {
    if (subscription instanceof WebSocket) {
      subscription.close();
    } else if (subscription && subscription.stop) {
      subscription.stop();
    }
  }
};

// Mock alert generation for development
function generateMockAlerts() {
  const severities = ['info', 'warning', 'critical'];
  const metrics = ['cpu', 'memory', 'error_rate', 'latency'];
  const statuses = ['active', 'acknowledged'];
  
  const alerts = [];
  const count = Math.floor(Math.random() * 5) + 2;
  
  for (let i = 0; i < count; i++) {
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const severity = severities[Math.floor(Math.random() * severities.length)];
    const metric = metrics[Math.floor(Math.random() * metrics.length)];
    
    alerts.push({
      id: `alert_${i}`,
      name: `High ${metric.replace('_', ' ')} alert`,
      metric,
      condition: 'greater_than',
      threshold: metric === 'cpu' || metric === 'memory' ? 80 : 
                 metric === 'error_rate' ? 5 : 300,
      duration: '5m',
      severity,
      status,
      message: `${metric.replace('_', ' ')} exceeded threshold`,
      triggeredAt: new Date(Date.now() - Math.random() * 3600000).toISOString(),
      acknowledgedAt: status === 'acknowledged' 
        ? new Date(Date.now() - Math.random() * 1800000).toISOString() 
        : null
    });
  }
  
  return alerts;
}

// Mock alert streaming for development
function startMockAlertStream(onAlert) {
  let running = true;
  
  const streamAlerts = () => {
    if (!running) return;
    
    // Randomly trigger an alert
    if (Math.random() < 0.1) {
      const metrics = ['cpu', 'memory', 'error_rate', 'latency'];
      const metric = metrics[Math.floor(Math.random() * metrics.length)];
      
      onAlert({
        id: `alert_${Date.now()}`,
        name: `High ${metric} alert`,
        metric,
        severity: Math.random() < 0.3 ? 'critical' : 'warning',
        status: 'active',
        message: `${metric} exceeded threshold`,
        triggeredAt: new Date().toISOString()
      });
    }
    
    setTimeout(streamAlerts, Math.random() * 10000 + 5000);
  };
  
  streamAlerts();
  
  return {
    stop: () => { running = false; }
  };
}