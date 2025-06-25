import React, { useState } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Zap, 
  Database,
  HardDrive,
  Network,
  Cpu,
  MemoryStick
} from 'lucide-react';

export const PerformanceMetrics = ({ metrics = {}, loading, timeRange }) => {
  const [selectedMetric, setSelectedMetric] = useState('response_time');

  const performanceData = {
    response_time: {
      label: 'Response Time',
      icon: Zap,
      unit: 'ms',
      data: metrics.responseTimeHistory || [],
      threshold: 300,
      color: 'blue'
    },
    throughput: {
      label: 'Throughput',
      icon: TrendingUp,
      unit: 'req/s',
      data: metrics.throughputHistory || [],
      threshold: null,
      color: 'green'
    },
    cpu_usage: {
      label: 'CPU Usage',
      icon: Cpu,
      unit: '%',
      data: metrics.cpuHistory || [],
      threshold: 80,
      color: 'purple'
    },
    memory_usage: {
      label: 'Memory Usage',
      icon: MemoryStick,
      unit: '%',
      data: metrics.memoryHistory || [],
      threshold: 85,
      color: 'orange'
    },
    disk_io: {
      label: 'Disk I/O',
      icon: HardDrive,
      unit: 'MB/s',
      data: metrics.diskIOHistory || [],
      threshold: null,
      color: 'teal'
    },
    network_io: {
      label: 'Network I/O',
      icon: Network,
      unit: 'MB/s',
      data: metrics.networkIOHistory || [],
      threshold: null,
      color: 'indigo'
    }
  };

  const selectedData = performanceData[selectedMetric];
  const maxValue = Math.max(...(selectedData.data.map(d => d.value) || [0]));
  const chartHeight = 200;

  const getBarColor = (value, threshold) => {
    if (!threshold) return `bg-${selectedData.color}-500`;
    return value > threshold ? 'bg-red-500' : `bg-${selectedData.color}-500`;
  };

  const formatValue = (value, unit) => {
    if (unit === '%') return `${value.toFixed(1)}%`;
    if (unit === 'ms') return `${value.toFixed(0)}ms`;
    if (unit === 'req/s') return `${value.toFixed(1)}/s`;
    if (unit === 'MB/s') return `${value.toFixed(2)}MB/s`;
    return value.toFixed(2);
  };

  const getStatistics = (data) => {
    if (!data || data.length === 0) return { avg: 0, min: 0, max: 0, p95: 0 };
    
    const values = data.map(d => d.value).sort((a, b) => a - b);
    const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
    const min = values[0];
    const max = values[values.length - 1];
    const p95Index = Math.floor(values.length * 0.95);
    const p95 = values[p95Index] || max;
    
    return { avg, min, max, p95 };
  };

  const stats = getStatistics(selectedData.data);

  if (loading) {
    return (
      <div className="performance-metrics bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="performance-metrics bg-white rounded-lg shadow">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Performance Metrics</h2>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-gray-400" />
            <span className="text-sm text-gray-600">{timeRange}</span>
          </div>
        </div>

        <div className="metric-selector grid grid-cols-3 lg:grid-cols-6 gap-2 mb-6">
          {Object.entries(performanceData).map(([key, metric]) => {
            const Icon = metric.icon;
            return (
              <button
                key={key}
                onClick={() => setSelectedMetric(key)}
                className={`p-3 rounded-lg border transition-all ${
                  selectedMetric === key
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300 text-gray-600'
                }`}
              >
                <Icon className="w-5 h-5 mx-auto mb-1" />
                <span className="text-xs block">{metric.label}</span>
              </button>
            );
          })}
        </div>

        <div className="metric-content">
          <div className="metric-header flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <selectedData.icon className={`w-6 h-6 text-${selectedData.color}-600`} />
              <h3 className="text-lg font-medium text-gray-900">{selectedData.label}</h3>
            </div>
            {selectedData.threshold && (
              <div className="text-sm text-gray-500">
                Threshold: {formatValue(selectedData.threshold, selectedData.unit)}
              </div>
            )}
          </div>

          <div className="statistics grid grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="text-xs text-gray-500 mb-1">Average</p>
              <p className="text-lg font-semibold text-gray-900">
                {formatValue(stats.avg, selectedData.unit)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Min</p>
              <p className="text-lg font-semibold text-gray-900">
                {formatValue(stats.min, selectedData.unit)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Max</p>
              <p className="text-lg font-semibold text-gray-900">
                {formatValue(stats.max, selectedData.unit)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">95th Percentile</p>
              <p className="text-lg font-semibold text-gray-900">
                {formatValue(stats.p95, selectedData.unit)}
              </p>
            </div>
          </div>

          <div className="chart-container">
            {selectedData.data.length > 0 ? (
              <div className="relative" style={{ height: chartHeight }}>
                <div className="flex items-end justify-between h-full">
                  {selectedData.data.slice(-30).map((point, index) => {
                    const barHeight = (point.value / maxValue) * chartHeight;
                    return (
                      <div
                        key={index}
                        className="flex-1 flex flex-col items-center justify-end mx-0.5 group"
                      >
                        <div className="relative w-full">
                          <div
                            className={`w-full ${getBarColor(point.value, selectedData.threshold)} opacity-80 hover:opacity-100 transition-opacity rounded-t`}
                            style={{ height: `${barHeight}px` }}
                          />
                          <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                            {formatValue(point.value, selectedData.unit)}
                            <br />
                            {new Date(point.timestamp).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {selectedData.threshold && (
                  <div
                    className="absolute w-full border-t-2 border-red-400 border-dashed"
                    style={{ bottom: `${(selectedData.threshold / maxValue) * chartHeight}px` }}
                  >
                    <span className="absolute right-0 -top-5 text-xs text-red-600 bg-white px-1">
                      Threshold
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <Database className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>No performance data available</p>
                <p className="text-sm mt-1">Data will appear as metrics are collected</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PerformanceMetrics;