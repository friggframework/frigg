import { apiService } from './apiService';

export const cloudWatchService = {
  async getMetrics({ integrationId, startTime, endTime, config }) {
    try {
      // Define the metrics to fetch
      const metricQueries = [
        {
          id: 'requestCount',
          namespace: config.namespace || 'AWS/Lambda',
          metricName: 'Invocations',
          stat: 'Sum',
          period: 300
        },
        {
          id: 'latency',
          namespace: config.namespace || 'AWS/Lambda',
          metricName: 'Duration',
          stat: 'Average',
          period: 300
        },
        {
          id: 'errorCount',
          namespace: config.namespace || 'AWS/Lambda',
          metricName: 'Errors',
          stat: 'Sum',
          period: 300
        },
        {
          id: 'cpuUtilization',
          namespace: 'AWS/EC2',
          metricName: 'CPUUtilization',
          stat: 'Average',
          period: 300
        },
        {
          id: 'memoryUtilization',
          namespace: 'CWAgent',
          metricName: 'mem_used_percent',
          stat: 'Average',
          period: 300
        },
        {
          id: 'activeConnections',
          namespace: config.namespace || 'AWS/ApplicationELB',
          metricName: 'ActiveConnectionCount',
          stat: 'Average',
          period: 300
        },
        {
          id: 'throughput',
          namespace: config.namespace || 'AWS/ApplicationELB',
          metricName: 'RequestCount',
          stat: 'Sum',
          period: 300
        },
        {
          id: 'healthChecks',
          namespace: config.namespace || 'AWS/Route53',
          metricName: 'HealthCheckStatus',
          stat: 'Average',
          period: 300
        },
        {
          id: 'diskIO',
          namespace: 'AWS/EC2',
          metricName: 'DiskReadBytes',
          stat: 'Average',
          period: 300
        },
        {
          id: 'networkIO',
          namespace: 'AWS/EC2',
          metricName: 'NetworkIn',
          stat: 'Average',
          period: 300
        }
      ];

      const response = await apiService.post('/monitoring/cloudwatch/metrics', {
        integrationId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        metricQueries,
        region: config.region || 'us-east-1'
      });

      // Transform the response into the expected format
      const transformedMetrics = {};
      
      response.data.metricDataResults.forEach(result => {
        transformedMetrics[result.id] = result.values.map((value, index) => ({
          timestamp: result.timestamps[index],
          value: value
        })).reverse(); // Reverse to have chronological order
      });

      return transformedMetrics;
    } catch (error) {
      console.error('CloudWatch service error:', error);
      
      // Return mock data for development/demo
      return generateMockMetrics(startTime, endTime);
    }
  },

  async createAlarm({ integrationId, alarmConfig, config }) {
    try {
      const response = await apiService.post('/monitoring/cloudwatch/alarms', {
        integrationId,
        ...alarmConfig,
        region: config.region || 'us-east-1'
      });
      
      return response.data;
    } catch (error) {
      console.error('Error creating CloudWatch alarm:', error);
      throw error;
    }
  },

  async getAlarms({ integrationId, config }) {
    try {
      const response = await apiService.get('/monitoring/cloudwatch/alarms', {
        params: {
          integrationId,
          region: config.region || 'us-east-1'
        }
      });
      
      return response.data.alarms;
    } catch (error) {
      console.error('Error fetching CloudWatch alarms:', error);
      throw error;
    }
  },

  async getDashboards({ integrationId, config }) {
    try {
      const response = await apiService.get('/monitoring/cloudwatch/dashboards', {
        params: {
          integrationId,
          region: config.region || 'us-east-1'
        }
      });
      
      return response.data.dashboards;
    } catch (error) {
      console.error('Error fetching CloudWatch dashboards:', error);
      throw error;
    }
  }
};

// Helper function to generate mock metrics for development
function generateMockMetrics(startTime, endTime) {
  const duration = endTime - startTime;
  const points = Math.floor(duration / (5 * 60 * 1000)); // 5-minute intervals
  
  const generateTimeSeries = (baseValue, variation, trend = 0) => {
    const data = [];
    for (let i = 0; i < points; i++) {
      const timestamp = new Date(startTime.getTime() + (i * 5 * 60 * 1000));
      const trendFactor = 1 + (trend * i / points);
      const value = baseValue * trendFactor + (Math.random() - 0.5) * variation;
      data.push({ timestamp: timestamp.toISOString(), value: Math.max(0, value) });
    }
    return data;
  };
  
  return {
    requestCount: generateTimeSeries(1000, 200, 0.1),
    latency: generateTimeSeries(150, 50, -0.05),
    errorCount: generateTimeSeries(5, 3),
    cpuUtilization: generateTimeSeries(45, 20),
    memoryUtilization: generateTimeSeries(60, 15),
    activeConnections: generateTimeSeries(200, 50),
    throughput: generateTimeSeries(5000, 1000, 0.15),
    healthChecks: generateTimeSeries(1, 0.1),
    diskIO: generateTimeSeries(50, 20),
    networkIO: generateTimeSeries(100, 30)
  };
}