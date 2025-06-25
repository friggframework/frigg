import { apiService } from './apiService';

export const deploymentService = {
  async getDeployments({ integrationId, config, limit = 10 }) {
    try {
      const response = await apiService.get('/monitoring/deployments', {
        params: {
          integrationId,
          limit,
          region: config.region || 'us-east-1'
        }
      });
      
      return response.data.deployments;
    } catch (error) {
      console.error('Error fetching deployments:', error);
      
      // Return mock deployments for development
      return generateMockDeployments(limit);
    }
  },

  async getDeploymentDetails({ integrationId, deploymentId, config }) {
    try {
      const response = await apiService.get(`/monitoring/deployments/${deploymentId}`, {
        params: {
          integrationId,
          region: config.region || 'us-east-1'
        }
      });
      
      return response.data.deployment;
    } catch (error) {
      console.error('Error fetching deployment details:', error);
      throw error;
    }
  },

  async triggerDeployment({ integrationId, branch, environment, version, config }) {
    try {
      const response = await apiService.post('/monitoring/deployments', {
        integrationId,
        branch,
        environment,
        version,
        triggeredBy: config.userId || 'user',
        region: config.region || 'us-east-1'
      });
      
      return response.data.deployment;
    } catch (error) {
      console.error('Error triggering deployment:', error);
      throw error;
    }
  },

  async rollbackDeployment({ integrationId, deploymentId, targetVersion, config }) {
    try {
      const response = await apiService.post(`/monitoring/deployments/${deploymentId}/rollback`, {
        integrationId,
        targetVersion,
        triggeredBy: config.userId || 'user',
        region: config.region || 'us-east-1'
      });
      
      return response.data.deployment;
    } catch (error) {
      console.error('Error rolling back deployment:', error);
      throw error;
    }
  },

  async cancelDeployment({ integrationId, deploymentId, config }) {
    try {
      const response = await apiService.post(`/monitoring/deployments/${deploymentId}/cancel`, {
        integrationId,
        cancelledBy: config.userId || 'user',
        region: config.region || 'us-east-1'
      });
      
      return response.data;
    } catch (error) {
      console.error('Error cancelling deployment:', error);
      throw error;
    }
  },

  subscribeToDeployments({ integrationId, config, onUpdate, onError }) {
    try {
      // WebSocket subscription for deployment updates
      const wsUrl = `${apiService.getWebSocketUrl()}/monitoring/deployments/subscribe`;
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
          const deployment = JSON.parse(event.data);
          onUpdate(deployment);
        } catch (err) {
          console.error('Error parsing deployment message:', err);
        }
      };
      
      ws.onerror = (error) => {
        onError(error);
      };
      
      return ws;
    } catch (error) {
      console.error('Error subscribing to deployments:', error);
      
      // Fallback to mock subscription for development
      return startMockDeploymentStream(onUpdate);
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

// Mock deployment generation for development
function generateMockDeployments(limit) {
  const deployments = [];
  const statuses = ['success', 'failed', 'in_progress', 'pending'];
  const environments = ['production', 'staging', 'development'];
  const branches = ['main', 'develop', 'feature/new-ui', 'hotfix/bug-123'];
  
  for (let i = 0; i < limit; i++) {
    const status = i === 0 ? 'in_progress' : statuses[Math.floor(Math.random() * statuses.length)];
    const startTime = new Date(Date.now() - (i * 3600000) - Math.random() * 3600000);
    const endTime = status === 'in_progress' || status === 'pending' 
      ? null 
      : new Date(startTime.getTime() + Math.random() * 600000 + 120000);
    
    deployments.push({
      id: `deploy_${i}`,
      version: `v1.${100 - i}.0`,
      commitId: Math.random().toString(36).substr(2, 40),
      branch: branches[Math.floor(Math.random() * branches.length)],
      environment: environments[Math.floor(Math.random() * environments.length)],
      status,
      startTime: startTime.toISOString(),
      endTime: endTime ? endTime.toISOString() : null,
      deployedBy: `user_${Math.floor(Math.random() * 10)}`,
      message: status === 'failed' ? 'Build failed: tests did not pass' : 
               status === 'success' ? 'Deployment completed successfully' :
               status === 'in_progress' ? 'Deployment in progress...' :
               'Waiting for approval'
    });
  }
  
  return deployments;
}

// Mock deployment streaming for development
function startMockDeploymentStream(onUpdate) {
  let running = true;
  let currentDeployment = null;
  
  const streamUpdates = () => {
    if (!running) return;
    
    // Simulate deployment progress
    if (currentDeployment && currentDeployment.status === 'in_progress') {
      const elapsed = Date.now() - new Date(currentDeployment.startTime).getTime();
      
      if (elapsed > 300000) { // 5 minutes
        currentDeployment.status = Math.random() < 0.8 ? 'success' : 'failed';
        currentDeployment.endTime = new Date().toISOString();
        currentDeployment.message = currentDeployment.status === 'success' 
          ? 'Deployment completed successfully'
          : 'Deployment failed: health check failed';
        onUpdate(currentDeployment);
        currentDeployment = null;
      }
    } else if (Math.random() < 0.05) { // 5% chance of new deployment
      currentDeployment = {
        id: `deploy_${Date.now()}`,
        version: `v1.${Math.floor(Math.random() * 100)}.0`,
        commitId: Math.random().toString(36).substr(2, 40),
        branch: 'main',
        environment: 'production',
        status: 'in_progress',
        startTime: new Date().toISOString(),
        endTime: null,
        deployedBy: 'automated',
        message: 'Deployment started'
      };
      onUpdate(currentDeployment);
    }
    
    setTimeout(streamUpdates, 5000);
  };
  
  streamUpdates();
  
  return {
    stop: () => { running = false; }
  };
}