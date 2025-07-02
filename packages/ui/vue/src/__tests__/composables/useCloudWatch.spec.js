import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { useCloudWatch } from '../../composables/useCloudWatch';

// Mock CloudWatch service
const mockCloudWatchService = {
  log: vi.fn(),
  logMetric: vi.fn(),
  logEvent: vi.fn(),
  logError: vi.fn(),
  startTimer: vi.fn(() => ({ end: vi.fn() })),
  getMetrics: vi.fn(),
  getEvents: vi.fn(),
  query: vi.fn(),
  createDashboard: vi.fn(),
  setDefaultDimensions: vi.fn(),
  setNamespace: vi.fn()
};

// Mock ui-core
vi.mock('@friggframework/ui-core', () => ({
  friggUICore: {
    getCloudWatchService: vi.fn(() => mockCloudWatchService)
  }
}));

const mockMetrics = [
  {
    MetricName: 'APILatency',
    Value: 150,
    Unit: 'Milliseconds',
    Timestamp: new Date().toISOString(),
    Dimensions: [
      { Name: 'Environment', Value: 'production' },
      { Name: 'Service', Value: 'api' }
    ]
  },
  {
    MetricName: 'ErrorCount',
    Value: 5,
    Unit: 'Count',
    Timestamp: new Date().toISOString(),
    Dimensions: [
      { Name: 'Environment', Value: 'production' },
      { Name: 'Service', Value: 'api' }
    ]
  }
];

const mockEvents = [
  {
    id: '1',
    type: 'API_CALL',
    message: 'GET /api/users',
    timestamp: new Date().toISOString(),
    metadata: { statusCode: 200, duration: 145 }
  },
  {
    id: '2',
    type: 'ERROR',
    message: 'Database connection failed',
    timestamp: new Date().toISOString(),
    metadata: { error: 'ECONNREFUSED' }
  }
];

describe('useCloudWatch', () => {
  let wrapper;
  
  const TestComponent = defineComponent({
    props: ['namespace'],
    setup(props) {
      return useCloudWatch(props.namespace);
    },
    template: '<div>Test</div>'
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockCloudWatchService.getMetrics.mockResolvedValue(mockMetrics);
    mockCloudWatchService.getEvents.mockResolvedValue(mockEvents);
  });

  it('should provide logging methods', () => {
    wrapper = mount(TestComponent);
    const result = wrapper.vm.$options.setup();
    
    expect(result.log).toBeDefined();
    expect(result.logMetric).toBeDefined();
    expect(result.logEvent).toBeDefined();
    expect(result.logError).toBeDefined();
    expect(result.startTimer).toBeDefined();
  });

  it('should provide query methods', () => {
    wrapper = mount(TestComponent);
    const result = wrapper.vm.$options.setup();
    
    expect(result.getMetrics).toBeDefined();
    expect(result.getEvents).toBeDefined();
    expect(result.query).toBeDefined();
  });

  it('should provide reactive state', () => {
    wrapper = mount(TestComponent);
    const { metrics, events, loading, error } = wrapper.vm.$options.setup();
    
    expect(metrics.value).toEqual([]);
    expect(events.value).toEqual([]);
    expect(loading.value).toBe(false);
    expect(error.value).toBe(null);
  });

  it('should set namespace on initialization', () => {
    wrapper = mount(TestComponent, {
      props: { namespace: 'MyApp/Production' }
    });
    
    expect(mockCloudWatchService.setNamespace).toHaveBeenCalledWith('MyApp/Production');
  });

  it('should log message', () => {
    wrapper = mount(TestComponent);
    const { log } = wrapper.vm.$options.setup();
    
    log('User logged in', { userId: '123' });
    
    expect(mockCloudWatchService.log).toHaveBeenCalledWith('User logged in', { userId: '123' });
  });

  it('should log metric', () => {
    wrapper = mount(TestComponent);
    const { logMetric } = wrapper.vm.$options.setup();
    
    const metric = {
      name: 'APILatency',
      value: 200,
      unit: 'Milliseconds',
      dimensions: { endpoint: '/api/users' }
    };
    
    logMetric(metric.name, metric.value, metric.unit, metric.dimensions);
    
    expect(mockCloudWatchService.logMetric).toHaveBeenCalledWith(
      metric.name,
      metric.value,
      metric.unit,
      metric.dimensions
    );
  });

  it('should log event', () => {
    wrapper = mount(TestComponent);
    const { logEvent } = wrapper.vm.$options.setup();
    
    const event = {
      type: 'USER_ACTION',
      message: 'User clicked button',
      metadata: { buttonId: 'submit-btn' }
    };
    
    logEvent(event.type, event.message, event.metadata);
    
    expect(mockCloudWatchService.logEvent).toHaveBeenCalledWith(
      event.type,
      event.message,
      event.metadata
    );
  });

  it('should log error', () => {
    wrapper = mount(TestComponent);
    const { logError } = wrapper.vm.$options.setup();
    
    const error = new Error('Something went wrong');
    const context = { userId: '123', action: 'createOrder' };
    
    logError(error, context);
    
    expect(mockCloudWatchService.logError).toHaveBeenCalledWith(error, context);
  });

  it('should start and end timer', () => {
    const mockTimer = { end: vi.fn() };
    mockCloudWatchService.startTimer.mockReturnValueOnce(mockTimer);
    
    wrapper = mount(TestComponent);
    const { startTimer } = wrapper.vm.$options.setup();
    
    const timer = startTimer('operationDuration');
    
    expect(mockCloudWatchService.startTimer).toHaveBeenCalledWith('operationDuration');
    expect(timer).toBe(mockTimer);
    
    timer.end();
    expect(mockTimer.end).toHaveBeenCalled();
  });

  it('should fetch metrics', async () => {
    wrapper = mount(TestComponent);
    const { getMetrics, metrics, loading } = wrapper.vm.$options.setup();
    
    const filter = {
      MetricName: 'APILatency',
      StartTime: new Date(Date.now() - 3600000),
      EndTime: new Date()
    };
    
    const promise = getMetrics(filter);
    expect(loading.value).toBe(true);
    
    await promise;
    
    expect(mockCloudWatchService.getMetrics).toHaveBeenCalledWith(filter);
    expect(metrics.value).toEqual(mockMetrics);
    expect(loading.value).toBe(false);
  });

  it('should fetch events', async () => {
    wrapper = mount(TestComponent);
    const { getEvents, events } = wrapper.vm.$options.setup();
    
    const filter = {
      type: 'ERROR',
      startTime: new Date(Date.now() - 3600000),
      endTime: new Date()
    };
    
    await getEvents(filter);
    
    expect(mockCloudWatchService.getEvents).toHaveBeenCalledWith(filter);
    expect(events.value).toEqual(mockEvents);
  });

  it('should execute custom query', async () => {
    const queryResult = {
      results: [{ timestamp: new Date(), value: 42 }],
      statistics: { average: 42, max: 50, min: 30 }
    };
    
    mockCloudWatchService.query.mockResolvedValueOnce(queryResult);
    
    wrapper = mount(TestComponent);
    const { query } = wrapper.vm.$options.setup();
    
    const queryParams = {
      metric: 'CPUUtilization',
      statistics: ['Average', 'Maximum'],
      period: 300
    };
    
    const result = await query(queryParams);
    
    expect(mockCloudWatchService.query).toHaveBeenCalledWith(queryParams);
    expect(result).toEqual(queryResult);
  });

  it('should handle fetch errors', async () => {
    mockCloudWatchService.getMetrics.mockRejectedValueOnce(new Error('API error'));
    
    wrapper = mount(TestComponent);
    const { getMetrics, error, hasError } = wrapper.vm.$options.setup();
    
    await getMetrics({});
    
    expect(error.value).toBeInstanceOf(Error);
    expect(error.value.message).toBe('API error');
    expect(hasError.value).toBe(true);
  });

  it('should create dashboard', async () => {
    const dashboardConfig = {
      name: 'My Dashboard',
      widgets: [
        { type: 'metric', metric: 'APILatency' },
        { type: 'log', query: 'ERROR' }
      ]
    };
    
    mockCloudWatchService.createDashboard.mockResolvedValueOnce({ id: 'dashboard-123' });
    
    wrapper = mount(TestComponent);
    const { createDashboard } = wrapper.vm.$options.setup();
    
    const result = await createDashboard(dashboardConfig);
    
    expect(mockCloudWatchService.createDashboard).toHaveBeenCalledWith(dashboardConfig);
    expect(result).toEqual({ id: 'dashboard-123' });
  });

  it('should set default dimensions', () => {
    wrapper = mount(TestComponent);
    const { setDefaultDimensions } = wrapper.vm.$options.setup();
    
    const dimensions = {
      Environment: 'production',
      Service: 'api',
      Version: '1.2.3'
    };
    
    setDefaultDimensions(dimensions);
    
    expect(mockCloudWatchService.setDefaultDimensions).toHaveBeenCalledWith(dimensions);
  });

  it('should clear error', () => {
    wrapper = mount(TestComponent);
    const { error, clearError } = wrapper.vm.$options.setup();
    
    error.value = new Error('Test error');
    clearError();
    
    expect(error.value).toBe(null);
  });

  it('should compute filtered metrics', () => {
    wrapper = mount(TestComponent);
    const { metrics, errorMetrics, highLatencyMetrics } = wrapper.vm.$options.setup();
    
    metrics.value = [
      { MetricName: 'ErrorCount', Value: 10 },
      { MetricName: 'APILatency', Value: 500 },
      { MetricName: 'APILatency', Value: 100 },
      { MetricName: 'SuccessCount', Value: 1000 }
    ];
    
    expect(errorMetrics.value).toHaveLength(1);
    expect(errorMetrics.value[0].MetricName).toBe('ErrorCount');
    
    expect(highLatencyMetrics.value).toHaveLength(1);
    expect(highLatencyMetrics.value[0].Value).toBe(500);
  });

  it('should compute error events', () => {
    wrapper = mount(TestComponent);
    const { events, errorEvents } = wrapper.vm.$options.setup();
    
    events.value = mockEvents;
    
    expect(errorEvents.value).toHaveLength(1);
    expect(errorEvents.value[0].type).toBe('ERROR');
  });

  it('should refresh metrics and events', async () => {
    wrapper = mount(TestComponent);
    const { refreshData } = wrapper.vm.$options.setup();
    
    await refreshData();
    
    expect(mockCloudWatchService.getMetrics).toHaveBeenCalled();
    expect(mockCloudWatchService.getEvents).toHaveBeenCalled();
  });

  it('should handle concurrent operations', async () => {
    wrapper = mount(TestComponent);
    const { getMetrics, getEvents, loading } = wrapper.vm.$options.setup();
    
    const metricsPromise = getMetrics({});
    const eventsPromise = getEvents({});
    
    expect(loading.value).toBe(true);
    
    await Promise.all([metricsPromise, eventsPromise]);
    
    expect(loading.value).toBe(false);
  });
});