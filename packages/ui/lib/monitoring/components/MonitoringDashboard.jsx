import React, { useState, useEffect } from 'react';
import { Card } from '../../components/index';
import { MetricsOverview } from './MetricsOverview';
import { LogStream } from './LogStream';
import { AlertsPanel } from './AlertsPanel';
import { DeploymentStatus } from './DeploymentStatus';
import { PerformanceMetrics } from './PerformanceMetrics';
import { useCloudWatchMetrics } from '../hooks/useCloudWatchMetrics';
import { useLogs } from '../hooks/useLogs';
import { useAlerts } from '../hooks/useAlerts';

export const MonitoringDashboard = ({ integrationId, config = {} }) => {
  const [selectedTimeRange, setSelectedTimeRange] = useState('1h');
  const [refreshInterval, setRefreshInterval] = useState(30000); // 30 seconds
  
  const { metrics, loading: metricsLoading, error: metricsError } = useCloudWatchMetrics({
    integrationId,
    timeRange: selectedTimeRange,
    refreshInterval,
    config
  });
  
  const { logs, streaming, toggleStreaming } = useLogs({
    integrationId,
    config
  });
  
  const { alerts, acknowledgeAlert, createAlert } = useAlerts({
    integrationId,
    config
  });

  const timeRanges = [
    { value: '5m', label: 'Last 5 minutes' },
    { value: '15m', label: 'Last 15 minutes' },
    { value: '1h', label: 'Last hour' },
    { value: '6h', label: 'Last 6 hours' },
    { value: '24h', label: 'Last 24 hours' },
    { value: '7d', label: 'Last 7 days' }
  ];

  return (
    <div className="monitoring-dashboard p-6 space-y-6">
      <div className="dashboard-header flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Production Monitoring</h1>
        <div className="controls flex gap-4">
          <select
            value={selectedTimeRange}
            onChange={(e) => setSelectedTimeRange(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {timeRanges.map(range => (
              <option key={range.value} value={range.value}>
                {range.label}
              </option>
            ))}
          </select>
          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={10000}>Refresh: 10s</option>
            <option value={30000}>Refresh: 30s</option>
            <option value={60000}>Refresh: 1m</option>
            <option value={300000}>Refresh: 5m</option>
            <option value={0}>Manual</option>
          </select>
        </div>
      </div>

      {metricsError && (
        <div className="error-banner bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600">Error loading metrics: {metricsError.message}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="metrics-section">
          <MetricsOverview 
            metrics={metrics}
            loading={metricsLoading}
            timeRange={selectedTimeRange}
          />
        </div>
        
        <div className="alerts-section">
          <AlertsPanel
            alerts={alerts}
            onAcknowledge={acknowledgeAlert}
            onCreate={createAlert}
          />
        </div>
      </div>

      <div className="deployment-section">
        <DeploymentStatus
          integrationId={integrationId}
          config={config}
        />
      </div>

      <div className="performance-section">
        <PerformanceMetrics
          metrics={metrics}
          loading={metricsLoading}
          timeRange={selectedTimeRange}
        />
      </div>

      <div className="logs-section">
        <LogStream
          logs={logs}
          streaming={streaming}
          onToggleStreaming={toggleStreaming}
        />
      </div>
    </div>
  );
};

export default MonitoringDashboard;