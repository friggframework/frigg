import React, { useState, useEffect } from 'react';
import { 
  GitBranch, 
  GitCommit, 
  Clock, 
  CheckCircle, 
  XCircle,
  AlertCircle,
  RefreshCw,
  Package,
  Loader
} from 'lucide-react';
import { useDeploymentStatus } from '../hooks/useDeploymentStatus';

export const DeploymentStatus = ({ integrationId, config }) => {
  const { deployments, loading, error, refresh } = useDeploymentStatus({
    integrationId,
    config
  });

  const getStatusIcon = (status) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'in_progress':
        return <Loader className="w-5 h-5 text-blue-600 animate-spin" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-600" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-600" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'success':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'failed':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'in_progress':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'pending':
        return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const formatDuration = (startTime, endTime) => {
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const duration = Math.floor((end - start) / 1000);
    
    if (duration < 60) return `${duration}s`;
    if (duration < 3600) return `${Math.floor(duration / 60)}m ${duration % 60}s`;
    return `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`;
  };

  const currentDeployment = deployments?.[0];
  const recentDeployments = deployments?.slice(1, 6) || [];

  if (loading) {
    return (
      <div className="deployment-status bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="deployment-status bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Deployment Status</h2>
          <button
            onClick={refresh}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <div className="text-center py-8 text-red-600">
          <AlertCircle className="w-12 h-12 mx-auto mb-2" />
          <p>Error loading deployment status</p>
          <p className="text-sm mt-1">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="deployment-status bg-white rounded-lg shadow">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Deployment Status</h2>
          <button
            onClick={refresh}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
            title="Refresh deployments"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {currentDeployment && (
          <div className="current-deployment mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Current Deployment</h3>
            <div className={`p-4 border rounded-lg ${getStatusColor(currentDeployment.status)}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  {getStatusIcon(currentDeployment.status)}
                  <div>
                    <h4 className="font-medium text-gray-900">
                      {currentDeployment.version || currentDeployment.commitId?.substring(0, 7)}
                    </h4>
                    <p className="text-sm text-gray-600 mt-1">
                      {currentDeployment.environment || 'Production'}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-medium capitalize">
                  {currentDeployment.status.replace('_', ' ')}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">
                    {currentDeployment.branch || 'main'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <GitCommit className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">
                    {currentDeployment.commitId?.substring(0, 7) || 'N/A'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">
                    {formatDuration(currentDeployment.startTime, currentDeployment.endTime)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">
                    {currentDeployment.deployedBy || 'System'}
                  </span>
                </div>
              </div>

              {currentDeployment.message && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p className="text-sm text-gray-600">{currentDeployment.message}</p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="recent-deployments">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Recent Deployments</h3>
          {recentDeployments.length > 0 ? (
            <div className="space-y-2">
              {recentDeployments.map((deployment, index) => (
                <div
                  key={deployment.id || index}
                  className="deployment-item flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(deployment.status)}
                    <div>
                      <span className="font-medium text-gray-900">
                        {deployment.version || deployment.commitId?.substring(0, 7)}
                      </span>
                      <span className="text-sm text-gray-500 ml-2">
                        {new Date(deployment.startTime).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-600">
                      {formatDuration(deployment.startTime, deployment.endTime)}
                    </span>
                    <span className={`text-sm font-medium capitalize ${
                      deployment.status === 'success' ? 'text-green-600' : 
                      deployment.status === 'failed' ? 'text-red-600' : 
                      'text-gray-600'
                    }`}>
                      {deployment.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-gray-500">
              <Package className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No deployment history available</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DeploymentStatus;