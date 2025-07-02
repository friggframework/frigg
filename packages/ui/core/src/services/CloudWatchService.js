/**
 * Framework-agnostic CloudWatch service
 * Extracted from @friggframework/ui for multi-framework support
 */

export class CloudWatchService {
  constructor(apiService) {
    this.apiService = apiService;
  }

  async getMetrics({ integrationId, startTime, endTime, config = {} }) {
    try {
      const params = {
        integrationId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        ...config
      };

      const endpoints = {
        requestCount: '/monitoring/metrics/requests',
        latency: '/monitoring/metrics/latency',
        errorCount: '/monitoring/metrics/errors',
        healthChecks: '/monitoring/metrics/health',
        cpuUtilization: '/monitoring/metrics/cpu',
        memoryUtilization: '/monitoring/metrics/memory',
        activeConnections: '/monitoring/metrics/connections',
        throughput: '/monitoring/metrics/throughput',
        diskIO: '/monitoring/metrics/disk',
        networkIO: '/monitoring/metrics/network'
      };

      const results = {};
      
      // Fetch all metrics in parallel
      await Promise.all(
        Object.entries(endpoints).map(async ([key, endpoint]) => {
          try {
            const response = await this.apiService.post(endpoint, params);
            results[key] = response.data || [];
          } catch (error) {
            console.warn(`Failed to fetch ${key} metrics:`, error);
            results[key] = [];
          }
        })
      );

      return results;
    } catch (error) {
      console.error('CloudWatch metrics fetch error:', error);
      throw error;
    }
  }

  async getAlerts(integrationId) {
    try {
      const response = await this.apiService.get(`/monitoring/alerts/${integrationId}`);
      return response.data || [];
    } catch (error) {
      console.error('CloudWatch alerts fetch error:', error);
      throw error;
    }
  }

  async getLogs({ integrationId, startTime, endTime, logLevel = 'INFO' }) {
    try {
      const params = {
        integrationId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        logLevel
      };

      const response = await this.apiService.post('/monitoring/logs', params);
      return response.data || [];
    } catch (error) {
      console.error('CloudWatch logs fetch error:', error);
      throw error;
    }
  }

  async getCustomMetrics(integrationId, metricNames) {
    try {
      const params = {
        integrationId,
        metricNames: Array.isArray(metricNames) ? metricNames : [metricNames]
      };

      const response = await this.apiService.post('/monitoring/metrics/custom', params);
      return response.data || {};
    } catch (error) {
      console.error('Custom metrics fetch error:', error);
      throw error;
    }
  }

  // Helper methods for metrics processing
  calculateAverage(dataPoints = []) {
    if (!dataPoints.length) return 0;
    const sum = dataPoints.reduce((acc, point) => acc + (point.value || 0), 0);
    return sum / dataPoints.length;
  }

  calculateErrorRate(errors = [], requests = []) {
    const totalErrors = errors.reduce((sum, point) => sum + (point.value || 0), 0);
    const totalRequests = requests.reduce((sum, point) => sum + (point.value || 0), 0);
    return totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
  }

  calculateUptime(healthChecks = []) {
    if (!healthChecks.length) return 100;
    const successful = healthChecks.filter(check => check.value === 1).length;
    return (successful / healthChecks.length) * 100;
  }

  getLatestValue(dataPoints = []) {
    if (!dataPoints.length) return 0;
    return dataPoints[dataPoints.length - 1].value || 0;
  }

  calculateTrend(dataPoints = []) {
    if (dataPoints.length < 2) return 0;
    
    const recent = dataPoints.slice(-10);
    const older = dataPoints.slice(-20, -10);
    
    const recentAvg = this.calculateAverage(recent);
    const olderAvg = this.calculateAverage(older);
    
    if (olderAvg === 0) return 0;
    return ((recentAvg - olderAvg) / olderAvg) * 100;
  }

  formatTimeSeries(dataPoints = []) {
    return dataPoints.map(point => ({
      timestamp: point.timestamp,
      value: point.value || 0
    }));
  }
}