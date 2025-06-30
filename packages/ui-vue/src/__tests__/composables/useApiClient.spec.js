import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { useApiClient } from '../../composables/useApiClient';

// Mock API service
const mockApiService = {
  request: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  setDefaultHeaders: vi.fn(),
  setAuthToken: vi.fn(),
  clearAuthToken: vi.fn(),
  interceptRequest: vi.fn(),
  interceptResponse: vi.fn()
};

// Mock ui-core
vi.mock('@friggframework/ui-core', () => ({
  friggUICore: {
    getApiService: vi.fn(() => mockApiService)
  }
}));

describe('useApiClient', () => {
  let wrapper;
  
  const TestComponent = defineComponent({
    setup() {
      return useApiClient();
    },
    template: '<div>Test</div>'
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should provide all API methods', () => {
    wrapper = mount(TestComponent);
    const result = wrapper.vm.$options.setup();
    
    expect(result.request).toBeDefined();
    expect(result.get).toBeDefined();
    expect(result.post).toBeDefined();
    expect(result.put).toBeDefined();
    expect(result.patch).toBeDefined();
    expect(result.deleteRequest).toBeDefined();
  });

  it('should provide reactive state', () => {
    wrapper = mount(TestComponent);
    const { loading, error, data } = wrapper.vm.$options.setup();
    
    expect(loading.value).toBe(false);
    expect(error.value).toBe(null);
    expect(data.value).toBe(null);
  });

  it('should perform GET request', async () => {
    mockApiService.get.mockResolvedValueOnce({ data: { id: 1, name: 'Test' } });
    
    wrapper = mount(TestComponent);
    const { get, loading, data, error } = wrapper.vm.$options.setup();
    
    const promise = get('/api/test');
    expect(loading.value).toBe(true);
    
    const result = await promise;
    
    expect(mockApiService.get).toHaveBeenCalledWith('/api/test', undefined);
    expect(result).toEqual({ data: { id: 1, name: 'Test' } });
    expect(data.value).toEqual({ data: { id: 1, name: 'Test' } });
    expect(loading.value).toBe(false);
    expect(error.value).toBe(null);
  });

  it('should perform POST request with data', async () => {
    const postData = { name: 'New Item' };
    mockApiService.post.mockResolvedValueOnce({ data: { id: 2, ...postData } });
    
    wrapper = mount(TestComponent);
    const { post, loading, data } = wrapper.vm.$options.setup();
    
    const result = await post('/api/items', postData);
    
    expect(mockApiService.post).toHaveBeenCalledWith('/api/items', postData, undefined);
    expect(result).toEqual({ data: { id: 2, name: 'New Item' } });
    expect(data.value).toEqual({ data: { id: 2, name: 'New Item' } });
    expect(loading.value).toBe(false);
  });

  it('should perform PUT request', async () => {
    const putData = { id: 1, name: 'Updated Item' };
    mockApiService.put.mockResolvedValueOnce({ data: putData });
    
    wrapper = mount(TestComponent);
    const { put } = wrapper.vm.$options.setup();
    
    await put('/api/items/1', putData);
    
    expect(mockApiService.put).toHaveBeenCalledWith('/api/items/1', putData, undefined);
  });

  it('should perform PATCH request', async () => {
    const patchData = { name: 'Partially Updated' };
    mockApiService.patch.mockResolvedValueOnce({ data: { id: 1, ...patchData } });
    
    wrapper = mount(TestComponent);
    const { patch } = wrapper.vm.$options.setup();
    
    await patch('/api/items/1', patchData);
    
    expect(mockApiService.patch).toHaveBeenCalledWith('/api/items/1', patchData, undefined);
  });

  it('should perform DELETE request', async () => {
    mockApiService.delete.mockResolvedValueOnce({ data: { success: true } });
    
    wrapper = mount(TestComponent);
    const { deleteRequest } = wrapper.vm.$options.setup();
    
    await deleteRequest('/api/items/1');
    
    expect(mockApiService.delete).toHaveBeenCalledWith('/api/items/1', undefined);
  });

  it('should handle request errors', async () => {
    const errorMessage = 'Network error';
    mockApiService.get.mockRejectedValueOnce(new Error(errorMessage));
    
    wrapper = mount(TestComponent);
    const { get, loading, error, data } = wrapper.vm.$options.setup();
    
    await get('/api/error');
    
    expect(loading.value).toBe(false);
    expect(error.value).toBeInstanceOf(Error);
    expect(error.value.message).toBe(errorMessage);
    expect(data.value).toBe(null);
  });

  it('should set auth token', () => {
    wrapper = mount(TestComponent);
    const { setAuthToken } = wrapper.vm.$options.setup();
    
    setAuthToken('Bearer token123');
    
    expect(mockApiService.setAuthToken).toHaveBeenCalledWith('Bearer token123');
  });

  it('should clear auth token', () => {
    wrapper = mount(TestComponent);
    const { clearAuthToken } = wrapper.vm.$options.setup();
    
    clearAuthToken();
    
    expect(mockApiService.clearAuthToken).toHaveBeenCalled();
  });

  it('should set default headers', () => {
    wrapper = mount(TestComponent);
    const { setDefaultHeaders } = wrapper.vm.$options.setup();
    
    const headers = { 'X-Custom-Header': 'value' };
    setDefaultHeaders(headers);
    
    expect(mockApiService.setDefaultHeaders).toHaveBeenCalledWith(headers);
  });

  it('should add request interceptor', () => {
    wrapper = mount(TestComponent);
    const { interceptRequest } = wrapper.vm.$options.setup();
    
    const interceptor = (config) => config;
    interceptRequest(interceptor);
    
    expect(mockApiService.interceptRequest).toHaveBeenCalledWith(interceptor);
  });

  it('should add response interceptor', () => {
    wrapper = mount(TestComponent);
    const { interceptResponse } = wrapper.vm.$options.setup();
    
    const interceptor = (response) => response;
    interceptResponse(interceptor);
    
    expect(mockApiService.interceptResponse).toHaveBeenCalledWith(interceptor);
  });

  it('should reset state on new request', async () => {
    wrapper = mount(TestComponent);
    const { get, error, data } = wrapper.vm.$options.setup();
    
    // Set initial error state
    error.value = new Error('Previous error');
    data.value = { old: 'data' };
    
    mockApiService.get.mockResolvedValueOnce({ data: { new: 'data' } });
    
    await get('/api/new');
    
    expect(error.value).toBe(null);
    expect(data.value).toEqual({ data: { new: 'data' } });
  });

  it('should handle generic request method', async () => {
    const config = {
      method: 'POST',
      url: '/api/custom',
      data: { custom: true }
    };
    
    mockApiService.request.mockResolvedValueOnce({ data: { success: true } });
    
    wrapper = mount(TestComponent);
    const { request } = wrapper.vm.$options.setup();
    
    await request(config);
    
    expect(mockApiService.request).toHaveBeenCalledWith(config);
  });
});