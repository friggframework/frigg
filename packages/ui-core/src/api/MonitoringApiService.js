/**
 * Framework-agnostic monitoring API service
 * Extracted from @friggframework/ui for multi-framework support
 */
export class MonitoringApiService {
  constructor(config = {}) {
    this.baseURL = config.baseURL || process.env.REACT_APP_API_URL || '/api';
    this.wsURL = config.wsURL || process.env.REACT_APP_WS_URL || 'ws://localhost:3001';
    this.authTokenSource = config.authTokenSource || (() => localStorage.getItem('authToken'));
  }

  async get(endpoint, options = {}) {
    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders(),
          ...options.headers
        },
        ...options
      });
      
      if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
      }
      
      return { data: await response.json() };
    } catch (error) {
      console.error('API GET Error:', error);
      throw error;
    }
  }

  async post(endpoint, data, options = {}) {
    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders(),
          ...options.headers
        },
        body: JSON.stringify(data),
        ...options
      });
      
      if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
      }
      
      return { data: await response.json() };
    } catch (error) {
      console.error('API POST Error:', error);
      throw error;
    }
  }

  async put(endpoint, data, options = {}) {
    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders(),
          ...options.headers
        },
        body: JSON.stringify(data),
        ...options
      });
      
      if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
      }
      
      return { data: await response.json() };
    } catch (error) {
      console.error('API PUT Error:', error);
      throw error;
    }
  }

  async delete(endpoint, options = {}) {
    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeaders(),
          ...options.headers
        },
        ...options
      });
      
      if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
      }
      
      return { data: await response.json() };
    } catch (error) {
      console.error('API DELETE Error:', error);
      throw error;
    }
  }

  getAuthHeaders() {
    // Get auth token from configured source
    const token = this.authTokenSource();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  getWebSocketUrl() {
    return this.wsURL;
  }
}