import React from 'react';
import { 
  Activity, 
  Clock, 
  Server, 
  TrendingUp, 
  TrendingDown,
  AlertCircle 
} from 'lucide-react';

export const MetricsOverview = ({ metrics = {}, loading, timeRange }) => {
  const {
    requestsPerSecond = 0,
    averageLatency = 0,
    errorRate = 0,
    uptime = 100,
    cpu = 0,
    memory = 0,
    activeConnections = 0,
    throughput = 0
  } = metrics;

  const formatNumber = (num) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
    return num.toFixed(2);
  };

  const formatPercentage = (num) => `${num.toFixed(2)}%`;

  const getStatusColor = (metric, value) => {
    switch (metric) {
      case 'errorRate':
        return value > 5 ? 'text-red-600' : value > 1 ? 'text-yellow-600' : 'text-green-600';
      case 'cpu':
      case 'memory':
        return value > 80 ? 'text-red-600' : value > 60 ? 'text-yellow-600' : 'text-green-600';
      case 'uptime':
        return value < 99 ? 'text-red-600' : value < 99.9 ? 'text-yellow-600' : 'text-green-600';
      default:
        return 'text-gray-600';
    }
  };

  const metricCards = [
    {
      title: 'Requests/sec',
      value: formatNumber(requestsPerSecond),
      icon: Activity,
      trend: metrics.requestsTrend,
      description: 'Incoming request rate'
    },
    {
      title: 'Avg Latency',
      value: `${averageLatency.toFixed(0)}ms`,
      icon: Clock,
      trend: metrics.latencyTrend,
      description: 'Average response time'
    },
    {
      title: 'Error Rate',
      value: formatPercentage(errorRate),
      icon: AlertCircle,
      trend: metrics.errorTrend,
      valueColor: getStatusColor('errorRate', errorRate),
      description: 'Failed requests percentage'
    },
    {
      title: 'Uptime',
      value: formatPercentage(uptime),
      icon: Server,
      valueColor: getStatusColor('uptime', uptime),
      description: 'Service availability'
    }
  ];

  const systemMetrics = [
    {
      title: 'CPU Usage',
      value: formatPercentage(cpu),
      valueColor: getStatusColor('cpu', cpu)
    },
    {
      title: 'Memory Usage',
      value: formatPercentage(memory),
      valueColor: getStatusColor('memory', memory)
    },
    {
      title: 'Active Connections',
      value: formatNumber(activeConnections)
    },
    {
      title: 'Throughput',
      value: `${formatNumber(throughput)}/s`
    }
  ];

  if (loading) {
    return (
      <div className="metrics-overview bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="metrics-overview bg-white rounded-lg shadow">
      <div className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Key Metrics - {timeRange}
        </h2>
        
        <div className="grid grid-cols-2 gap-4 mb-6">
          {metricCards.map((metric, index) => (
            <div key={index} className="metric-card border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between mb-2">
                <metric.icon className="w-5 h-5 text-gray-400" />
                {metric.trend && (
                  <div className="flex items-center text-sm">
                    {metric.trend > 0 ? (
                      <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-red-500 mr-1" />
                    )}
                    <span className={metric.trend > 0 ? 'text-green-600' : 'text-red-600'}>
                      {Math.abs(metric.trend)}%
                    </span>
                  </div>
                )}
              </div>
              <div className={`text-2xl font-bold mb-1 ${metric.valueColor || 'text-gray-900'}`}>
                {metric.value}
              </div>
              <div className="text-sm text-gray-500">{metric.title}</div>
              {metric.description && (
                <div className="text-xs text-gray-400 mt-1">{metric.description}</div>
              )}
            </div>
          ))}
        </div>

        <div className="system-metrics border-t border-gray-200 pt-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">System Resources</h3>
          <div className="grid grid-cols-2 gap-4">
            {systemMetrics.map((metric, index) => (
              <div key={index} className="flex justify-between items-center">
                <span className="text-sm text-gray-600">{metric.title}</span>
                <span className={`text-sm font-medium ${metric.valueColor || 'text-gray-900'}`}>
                  {metric.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MetricsOverview;