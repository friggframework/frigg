import { useState, useEffect, useCallback } from 'react';
import { cloudWatchService } from '../services/cloudWatchService';

export const useCloudWatchMetrics = ({
  integrationId,
  timeRange = '1h',
  refreshInterval = 30000,
  config = {}
}) => {
  const [metrics, setMetrics] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const parseTimeRange = (range) => {
    const now = new Date();
    const units = {
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000
    };
    
    const match = range.match(/(\d+)([mhd])/);
    if (!match) return { start: new Date(now - 60 * 60 * 1000), end: now };
    
    const [, value, unit] = match;
    const duration = parseInt(value) * units[unit];
    
    return {
      start: new Date(now - duration),
      end: now
    };
  };

  const fetchMetrics = useCallback(async () => {
    if (!integrationId) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const { start, end } = parseTimeRange(timeRange);
      
      const metricsData = await cloudWatchService.getMetrics({
        integrationId,
        startTime: start,
        endTime: end,
        config
      });
      
      // Process metrics data
      const processed = {
        requestsPerSecond: calculateAverage(metricsData.requestCount),
        averageLatency: calculateAverage(metricsData.latency),
        errorRate: calculateErrorRate(metricsData.errorCount, metricsData.requestCount),
        uptime: calculateUptime(metricsData.healthChecks),
        cpu: calculateAverage(metricsData.cpuUtilization),
        memory: calculateAverage(metricsData.memoryUtilization),
        activeConnections: getLatestValue(metricsData.activeConnections),
        throughput: calculateAverage(metricsData.throughput),
        
        // Trends
        requestsTrend: calculateTrend(metricsData.requestCount),
        latencyTrend: calculateTrend(metricsData.latency),
        errorTrend: calculateTrend(metricsData.errorCount),
        
        // History for charts
        responseTimeHistory: formatTimeSeries(metricsData.latency),
        throughputHistory: formatTimeSeries(metricsData.throughput),
        cpuHistory: formatTimeSeries(metricsData.cpuUtilization),
        memoryHistory: formatTimeSeries(metricsData.memoryUtilization),
        diskIOHistory: formatTimeSeries(metricsData.diskIO),
        networkIOHistory: formatTimeSeries(metricsData.networkIO)
      };
      
      setMetrics(processed);
    } catch (err) {
      console.error('Error fetching CloudWatch metrics:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [integrationId, timeRange, config]);

  useEffect(() => {
    fetchMetrics();
    
    if (refreshInterval > 0) {
      const interval = setInterval(fetchMetrics, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchMetrics, refreshInterval]);

  // Helper functions
  const calculateAverage = (dataPoints = []) => {
    if (!dataPoints.length) return 0;
    const sum = dataPoints.reduce((acc, point) => acc + point.value, 0);
    return sum / dataPoints.length;
  };

  const calculateErrorRate = (errors = [], requests = []) => {
    const totalErrors = errors.reduce((sum, point) => sum + point.value, 0);
    const totalRequests = requests.reduce((sum, point) => sum + point.value, 0);
    return totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
  };

  const calculateUptime = (healthChecks = []) => {
    if (!healthChecks.length) return 100;
    const successful = healthChecks.filter(check => check.value === 1).length;
    return (successful / healthChecks.length) * 100;
  };

  const getLatestValue = (dataPoints = []) => {
    if (!dataPoints.length) return 0;
    return dataPoints[dataPoints.length - 1].value;
  };

  const calculateTrend = (dataPoints = []) => {
    if (dataPoints.length < 2) return 0;
    
    const recent = dataPoints.slice(-10);
    const older = dataPoints.slice(-20, -10);
    
    const recentAvg = calculateAverage(recent);
    const olderAvg = calculateAverage(older);
    
    if (olderAvg === 0) return 0;
    return ((recentAvg - olderAvg) / olderAvg) * 100;
  };

  const formatTimeSeries = (dataPoints = []) => {
    return dataPoints.map(point => ({
      timestamp: point.timestamp,
      value: point.value
    }));
  };

  return {
    metrics,
    loading,
    error,
    refresh: fetchMetrics
  };
};