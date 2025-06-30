/**
 * Vue composable for API client using ui-core ApiService
 */

import { ref, computed } from 'vue';
import { friggUICore } from '@friggframework/ui-core';

export function useApiClient(config = {}) {
  const loading = ref(false);
  const error = ref(null);
  
  const apiService = friggUICore.getApiService();

  // Update API configuration if provided
  if (config.baseUrl || config.jwt) {
    friggUICore.updateConfig({ api: config });
  }

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

  // Authentication methods
  const login = async (username, password) => {
    return makeRequest(() => apiService.login(username, password));
  };

  const createUser = async (username, password) => {
    return makeRequest(() => apiService.createUser(username, password));
  };

  // Integration methods
  const listIntegrations = async () => {
    return makeRequest(() => apiService.listIntegrations());
  };

  const getAuthorizeRequirements = async (entityType, connectingEntityType) => {
    return makeRequest(() => 
      apiService.getAuthorizeRequirements(entityType, connectingEntityType)
    );
  };

  const authorize = async (entityType, authData) => {
    return makeRequest(() => apiService.authorize(entityType, authData));
  };

  const createIntegration = async (entity1, entity2, config) => {
    return makeRequest(() => apiService.createIntegration(entity1, entity2, config));
  };

  const updateIntegration = async (integrationId, config) => {
    return makeRequest(() => apiService.updateIntegration(integrationId, config));
  };

  const deleteIntegration = async (integrationId) => {
    return makeRequest(() => apiService.deleteIntegration(integrationId));
  };

  const getIntegrationConfigOptions = async (integrationId) => {
    return makeRequest(() => apiService.getIntegrationConfigOptions(integrationId));
  };

  const getSampleData = async (integrationId) => {
    return makeRequest(() => apiService.getSampleData(integrationId));
  };

  const getUserActions = async (integrationId, actionType) => {
    return makeRequest(() => apiService.getUserActions(integrationId, actionType));
  };

  const getUserActionOptions = async (integrationId, selectedUserAction, data) => {
    return makeRequest(() => 
      apiService.getUserActionOptions(integrationId, selectedUserAction, data)
    );
  };

  const submitUserAction = async (integrationId, selectedUserAction, data) => {
    return makeRequest(() => 
      apiService.submitUserAction(integrationId, selectedUserAction, data)
    );
  };

  const refreshOptions = async (options) => {
    return makeRequest(() => apiService.refreshOptions(options));
  };

  // Clear error state
  const clearError = () => {
    error.value = null;
  };

  return {
    // State
    loading: isLoading,
    error,
    hasError,
    
    // Authentication
    login,
    createUser,
    
    // Integrations
    listIntegrations,
    getAuthorizeRequirements,
    authorize,
    createIntegration,
    updateIntegration,
    deleteIntegration,
    getIntegrationConfigOptions,
    getSampleData,
    getUserActions,
    getUserActionOptions,
    submitUserAction,
    refreshOptions,
    
    // Utilities
    clearError
  };
}