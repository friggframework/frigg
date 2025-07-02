/**
 * Svelte store for API client using ui-core ApiClient
 */

import { writable, derived, get } from 'svelte/store';
import { friggUICore } from '@friggframework/ui-core';

// Create the API store
function createApiStore() {
  const apiClient = friggUICore.getApiClient();
  
  // Store for tracking API request states
  const requests = writable(new Map());
  
  // Store for global loading state
  const loading = derived(requests, $requests => {
    return Array.from($requests.values()).some(req => req.loading);
  });
  
  // Store for errors
  const errors = derived(requests, $requests => {
    return Array.from($requests.values())
      .filter(req => req.error)
      .map(req => req.error);
  });
  
  // Helper to generate request ID
  const generateRequestId = (method, url) => {
    return `${method}:${url}:${Date.now()}`;
  };
  
  // Helper to update request state
  const updateRequest = (id, state) => {
    requests.update(reqs => {
      reqs.set(id, state);
      return new Map(reqs);
    });
  };
  
  // Helper to remove request state
  const removeRequest = (id) => {
    requests.update(reqs => {
      reqs.delete(id);
      return new Map(reqs);
    });
  };
  
  // Wrapper for API methods with loading state tracking
  const wrapMethod = (method) => {
    return async (url, data, config = {}) => {
      const requestId = generateRequestId(method, url);
      
      // Set loading state
      updateRequest(requestId, {
        method,
        url,
        loading: true,
        error: null,
        data: null
      });
      
      try {
        // Make the API call
        const response = await apiClient[method](url, data, config);
        
        // Update with success
        updateRequest(requestId, {
          method,
          url,
          loading: false,
          error: null,
          data: response
        });
        
        // Clean up after a delay
        setTimeout(() => removeRequest(requestId), 5000);
        
        return response;
      } catch (error) {
        // Update with error
        updateRequest(requestId, {
          method,
          url,
          loading: false,
          error,
          data: null
        });
        
        // Clean up after a longer delay for errors
        setTimeout(() => removeRequest(requestId), 10000);
        
        throw error;
      }
    };
  };
  
  // Create wrapped API methods
  const api = {
    get: wrapMethod('get'),
    post: wrapMethod('post'),
    put: wrapMethod('put'),
    patch: wrapMethod('patch'),
    delete: wrapMethod('delete'),
    
    // Direct access to the underlying client for advanced use cases
    client: apiClient,
    
    // Configuration methods
    setBaseUrl: (url) => apiClient.setBaseUrl(url),
    setHeaders: (headers) => apiClient.setHeaders(headers),
    setAuthToken: (token) => apiClient.setAuthToken(token),
    clearAuthToken: () => apiClient.clearAuthToken(),
    
    // Interceptors
    addRequestInterceptor: (interceptor) => apiClient.addRequestInterceptor(interceptor),
    addResponseInterceptor: (interceptor) => apiClient.addResponseInterceptor(interceptor),
    removeRequestInterceptor: (id) => apiClient.removeRequestInterceptor(id),
    removeResponseInterceptor: (id) => apiClient.removeResponseInterceptor(id)
  };
  
  // Clear all requests
  const clearRequests = () => {
    requests.set(new Map());
  };
  
  // Get current loading state for a specific endpoint
  const isLoading = (method, url) => {
    const $requests = get(requests);
    return Array.from($requests.values()).some(
      req => req.method === method && req.url === url && req.loading
    );
  };
  
  // Get error for a specific endpoint
  const getError = (method, url) => {
    const $requests = get(requests);
    const req = Array.from($requests.values()).find(
      req => req.method === method && req.url === url && req.error
    );
    return req?.error || null;
  };
  
  return {
    subscribe: requests.subscribe,
    loading,
    errors,
    api,
    clearRequests,
    isLoading,
    getError
  };
}

// Export the API store instance
export const apiStore = createApiStore();

// Export the API methods for convenience
export const api = apiStore.api;

// Export loading and error stores
export const apiLoading = apiStore.loading;
export const apiErrors = apiStore.errors;