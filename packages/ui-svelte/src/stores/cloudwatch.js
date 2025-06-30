/**
 * Svelte store for CloudWatch monitoring using ui-core CloudWatchService
 */

import { writable, derived, readable } from 'svelte/store';
import { friggUICore } from '@friggframework/ui-core';

// Create the CloudWatch store
function createCloudWatchStore() {
  const cloudWatchService = friggUICore.getCloudWatchService();
  
  // Store for metrics data
  const metrics = writable({
    lambda: [],
    apiGateway: [],
    sqs: [],
    custom: []
  });
  
  // Store for real-time metric updates
  const realtimeMetrics = writable({
    enabled: false,
    interval: null,
    lastUpdate: null
  });
  
  // Store for metric configuration
  const config = writable({
    region: 'us-east-1',
    refreshInterval: 30000, // 30 seconds
    timeRange: {
      start: new Date(Date.now() - 3600000), // 1 hour ago
      end: new Date()
    }
  });
  
  // Fetch Lambda metrics
  const fetchLambdaMetrics = async (functionName, options = {}) => {
    try {
      const data = await cloudWatchService.getLambdaMetrics(functionName, options);
      metrics.update(m => ({
        ...m,
        lambda: data
      }));
      return data;
    } catch (error) {
      console.error('Failed to fetch Lambda metrics:', error);
      throw error;
    }
  };
  
  // Fetch API Gateway metrics
  const fetchApiGatewayMetrics = async (apiName, options = {}) => {
    try {
      const data = await cloudWatchService.getApiGatewayMetrics(apiName, options);
      metrics.update(m => ({
        ...m,
        apiGateway: data
      }));
      return data;
    } catch (error) {
      console.error('Failed to fetch API Gateway metrics:', error);
      throw error;
    }
  };
  
  // Fetch SQS metrics
  const fetchSqsMetrics = async (queueName, options = {}) => {
    try {
      const data = await cloudWatchService.getSqsMetrics(queueName, options);
      metrics.update(m => ({
        ...m,
        sqs: data
      }));
      return data;
    } catch (error) {
      console.error('Failed to fetch SQS metrics:', error);
      throw error;
    }
  };
  
  // Fetch custom metrics
  const fetchCustomMetrics = async (namespace, metricName, options = {}) => {
    try {
      const data = await cloudWatchService.getCustomMetrics(namespace, metricName, options);
      metrics.update(m => ({
        ...m,
        custom: data
      }));
      return data;
    } catch (error) {
      console.error('Failed to fetch custom metrics:', error);
      throw error;
    }
  };
  
  // Send custom metric
  const sendMetric = async (namespace, metricData) => {
    try {
      await cloudWatchService.putMetricData(namespace, metricData);
    } catch (error) {
      console.error('Failed to send metric:', error);
      throw error;
    }
  };
  
  // Start real-time updates
  const startRealtime = (resources = {}) => {
    realtimeMetrics.update(rt => {
      // Clear existing interval
      if (rt.interval) {
        clearInterval(rt.interval);
      }
      
      // Set up new interval
      const interval = setInterval(async () => {
        try {
          // Fetch all configured resources
          const promises = [];
          
          if (resources.lambdaFunctions) {
            resources.lambdaFunctions.forEach(fn => {
              promises.push(fetchLambdaMetrics(fn));
            });
          }
          
          if (resources.apiGateways) {
            resources.apiGateways.forEach(api => {
              promises.push(fetchApiGatewayMetrics(api));
            });
          }
          
          if (resources.sqsQueues) {
            resources.sqsQueues.forEach(queue => {
              promises.push(fetchSqsMetrics(queue));
            });
          }
          
          await Promise.all(promises);
          
          realtimeMetrics.update(rt => ({
            ...rt,
            lastUpdate: new Date()
          }));
        } catch (error) {
          console.error('Real-time update failed:', error);
        }
      }, 30000); // Update every 30 seconds
      
      return {
        enabled: true,
        interval,
        lastUpdate: new Date()
      };
    });
  };
  
  // Stop real-time updates
  const stopRealtime = () => {
    realtimeMetrics.update(rt => {
      if (rt.interval) {
        clearInterval(rt.interval);
      }
      return {
        enabled: false,
        interval: null,
        lastUpdate: rt.lastUpdate
      };
    });
  };
  
  // Update configuration
  const updateConfig = (updates) => {
    config.update(c => ({ ...c, ...updates }));
  };
  
  // Clean up
  const destroy = () => {
    stopRealtime();
  };
  
  return {
    metrics: { subscribe: metrics.subscribe },
    realtimeMetrics: { subscribe: realtimeMetrics.subscribe },
    config: { subscribe: config.subscribe },
    fetchLambdaMetrics,
    fetchApiGatewayMetrics,
    fetchSqsMetrics,
    fetchCustomMetrics,
    sendMetric,
    startRealtime,
    stopRealtime,
    updateConfig,
    destroy
  };
}

// Export the CloudWatch store instance
export const cloudWatchStore = createCloudWatchStore();

// Derived store for all metrics combined
export const allMetrics = derived(
  cloudWatchStore.metrics,
  $metrics => {
    return {
      lambda: $metrics.lambda,
      apiGateway: $metrics.apiGateway,
      sqs: $metrics.sqs,
      custom: $metrics.custom,
      all: [
        ...$metrics.lambda,
        ...$metrics.apiGateway,
        ...$metrics.sqs,
        ...$metrics.custom
      ]
    };
  }
);

// Derived store for metric statistics
export const metricStats = derived(
  cloudWatchStore.metrics,
  $metrics => {
    const calculateStats = (metricArray) => {
      if (!Array.isArray(metricArray) || metricArray.length === 0) {
        return { count: 0, average: 0, min: 0, max: 0 };
      }
      
      const values = metricArray.map(m => m.value).filter(v => typeof v === 'number');
      if (values.length === 0) {
        return { count: 0, average: 0, min: 0, max: 0 };
      }
      
      return {
        count: values.length,
        average: values.reduce((a, b) => a + b, 0) / values.length,
        min: Math.min(...values),
        max: Math.max(...values)
      };
    };
    
    return {
      lambda: calculateStats($metrics.lambda),
      apiGateway: calculateStats($metrics.apiGateway),
      sqs: calculateStats($metrics.sqs),
      custom: calculateStats($metrics.custom)
    };
  }
);

// Derived store for health status based on metrics
export const healthStatus = derived(
  [cloudWatchStore.metrics, cloudWatchStore.realtimeMetrics],
  ([$metrics, $realtime]) => {
    // Simple health check based on metric values
    const checkHealth = (metrics) => {
      if (!Array.isArray(metrics) || metrics.length === 0) return 'unknown';
      
      // Check for any error metrics
      const hasErrors = metrics.some(m => 
        m.metricName?.toLowerCase().includes('error') && m.value > 0
      );
      if (hasErrors) return 'error';
      
      // Check for high latency
      const hasHighLatency = metrics.some(m => 
        m.metricName?.toLowerCase().includes('duration') && m.value > 5000
      );
      if (hasHighLatency) return 'warning';
      
      return 'healthy';
    };
    
    return {
      lambda: checkHealth($metrics.lambda),
      apiGateway: checkHealth($metrics.apiGateway),
      sqs: checkHealth($metrics.sqs),
      overall: 'healthy', // This could be more sophisticated
      lastCheck: $realtime.lastUpdate
    };
  }
);