import { useState, useEffect, useCallback } from 'react';
import { deploymentService } from '../services/deploymentService';

export const useDeploymentStatus = ({ integrationId, config = {} }) => {
  const [deployments, setDeployments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDeployments = useCallback(async () => {
    if (!integrationId) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const deploymentsData = await deploymentService.getDeployments({
        integrationId,
        config,
        limit: 10
      });
      
      setDeployments(deploymentsData);
    } catch (err) {
      console.error('Error fetching deployments:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [integrationId, config]);

  const getDeploymentDetails = useCallback(async (deploymentId) => {
    try {
      const details = await deploymentService.getDeploymentDetails({
        integrationId,
        deploymentId,
        config
      });
      
      return details;
    } catch (err) {
      console.error('Error fetching deployment details:', err);
      throw err;
    }
  }, [integrationId, config]);

  const triggerDeployment = useCallback(async (deploymentConfig) => {
    if (!integrationId) return;
    
    try {
      const newDeployment = await deploymentService.triggerDeployment({
        integrationId,
        ...deploymentConfig,
        config
      });
      
      setDeployments(prev => [newDeployment, ...prev]);
      return newDeployment;
    } catch (err) {
      console.error('Error triggering deployment:', err);
      throw err;
    }
  }, [integrationId, config]);

  const rollbackDeployment = useCallback(async (deploymentId, targetVersion) => {
    try {
      const rollback = await deploymentService.rollbackDeployment({
        integrationId,
        deploymentId,
        targetVersion,
        config
      });
      
      setDeployments(prev => [rollback, ...prev]);
      return rollback;
    } catch (err) {
      console.error('Error rolling back deployment:', err);
      throw err;
    }
  }, [integrationId, config]);

  const cancelDeployment = useCallback(async (deploymentId) => {
    try {
      await deploymentService.cancelDeployment({
        integrationId,
        deploymentId,
        config
      });
      
      setDeployments(prev => prev.map(deployment =>
        deployment.id === deploymentId
          ? { ...deployment, status: 'cancelled' }
          : deployment
      ));
    } catch (err) {
      console.error('Error cancelling deployment:', err);
      throw err;
    }
  }, [integrationId, config]);

  // Subscribe to deployment status updates
  useEffect(() => {
    if (!integrationId) return;
    
    const subscription = deploymentService.subscribeToDeployments({
      integrationId,
      config,
      onUpdate: (deployment) => {
        setDeployments(prev => {
          const existing = prev.find(d => d.id === deployment.id);
          if (existing) {
            return prev.map(d => d.id === deployment.id ? deployment : d);
          }
          return [deployment, ...prev];
        });
      },
      onError: (err) => {
        console.error('Deployment subscription error:', err);
        setError(err);
      }
    });
    
    return () => {
      if (subscription) {
        deploymentService.unsubscribe(subscription);
      }
    };
  }, [integrationId, config]);

  // Initial fetch
  useEffect(() => {
    fetchDeployments();
  }, [fetchDeployments]);

  // Auto-refresh for active deployments
  useEffect(() => {
    const hasActiveDeployments = deployments.some(d => 
      ['pending', 'in_progress'].includes(d.status)
    );
    
    if (hasActiveDeployments) {
      const interval = setInterval(fetchDeployments, 5000);
      return () => clearInterval(interval);
    }
  }, [deployments, fetchDeployments]);

  return {
    deployments,
    loading,
    error,
    refresh: fetchDeployments,
    getDeploymentDetails,
    triggerDeployment,
    rollbackDeployment,
    cancelDeployment
  };
};