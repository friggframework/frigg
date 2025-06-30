/**
 * Vue composable for CloudWatch monitoring using ui-core CloudWatchService
 */

import { ref, computed } from 'vue';
import { friggUICore } from '@friggframework/ui-core';

export function useCloudWatch() {
  const metrics = ref([]);
  const logs = ref([]);
  const loading = ref(false);
  const error = ref(null);
  
  const cloudWatchService = friggUICore.getCloudWatchService();

  const isLoading = computed(() => loading.value);
  const hasError = computed(() => error.value !== null);

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

  // Fetch metrics
  const fetchMetrics = async (options = {}) => {
    return makeRequest(async () => {
      const result = await cloudWatchService.getMetrics(options);
      metrics.value = result;
      return result;
    });
  };

  // Fetch logs
  const fetchLogs = async (options = {}) => {
    return makeRequest(async () => {
      const result = await cloudWatchService.getLogs(options);
      logs.value = result;
      return result;
    });
  };

  // Get specific metric data
  const getMetricData = async (metricName, options = {}) => {
    return makeRequest(async () => {
      return await cloudWatchService.getMetricData(metricName, options);
    });
  };

  // Create custom metric
  const putMetric = async (metricData) => {
    return makeRequest(async () => {
      return await cloudWatchService.putMetric(metricData);
    });
  };

  // Get deployment status
  const getDeploymentStatus = async (deploymentId) => {
    return makeRequest(async () => {
      return await cloudWatchService.getDeploymentStatus(deploymentId);
    });
  };

  // Stream logs in real-time
  const streamLogs = (options = {}, callback) => {
    return cloudWatchService.streamLogs(options, callback);
  };

  // Clear error state
  const clearError = () => {
    error.value = null;
  };

  return {
    // State
    metrics,
    logs,
    loading: isLoading,
    error,
    hasError,
    
    // Actions
    fetchMetrics,
    fetchLogs,
    getMetricData,
    putMetric,
    getDeploymentStatus,
    streamLogs,
    
    // Utilities
    clearError
  };
}