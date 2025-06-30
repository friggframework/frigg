import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for auth
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized access
      localStorage.removeItem('authToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Integration APIs
export const getIntegrations = async () => {
  const response = await api.get('/integrations/all');
  return response.data;
};

export const getIntegrationById = async (id) => {
  const response = await api.get(`/integrations/${id}`);
  return response.data;
};

export const createIntegration = async (data) => {
  const response = await api.post('/integrations', data);
  return response.data;
};

export const updateIntegration = async (id, data) => {
  const response = await api.put(`/integrations/${id}`, data);
  return response.data;
};

export const deleteIntegration = async (id) => {
  const response = await api.delete(`/integrations/${id}`);
  return response.data;
};

// Auth APIs
export const login = async (credentials) => {
  const response = await api.post('/auth/login', credentials);
  return response.data;
};

export const logout = async () => {
  const response = await api.post('/auth/logout');
  return response.data;
};

export const getCurrentUser = async () => {
  const response = await api.get('/user/me');
  return response.data;
};

// OAuth flow
export const initiateOAuth = async (integrationId) => {
  const response = await api.get(`/authorize/${integrationId}`);
  return response.data;
};

export default api;