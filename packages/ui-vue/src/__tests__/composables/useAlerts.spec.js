import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { useAlerts } from '../../composables/useAlerts';

// Mock alerts service
const mockAlertsService = {
  getAlerts: vi.fn(),
  createAlert: vi.fn(),
  updateAlert: vi.fn(),
  deleteAlert: vi.fn(),
  acknowledgeAlert: vi.fn(),
  resolveAlert: vi.fn(),
  getAlertsByIntegration: vi.fn(),
  getAlertsBySeverity: vi.fn(),
  getAlertsByStatus: vi.fn()
};

// Mock ui-core
vi.mock('@friggframework/ui-core', () => ({
  friggUICore: {
    getAlertsService: vi.fn(() => mockAlertsService)
  }
}));

const mockAlerts = [
  {
    id: '1',
    title: 'Critical System Alert',
    message: 'Database connection lost',
    severity: 'critical',
    status: 'active',
    integrationId: 'integration-1',
    timestamp: new Date().toISOString(),
    metadata: { service: 'database', region: 'us-east-1' }
  },
  {
    id: '2',
    title: 'High CPU Usage',
    message: 'CPU usage above 90%',
    severity: 'high',
    status: 'active',
    integrationId: 'integration-1',
    timestamp: new Date().toISOString()
  },
  {
    id: '3',
    title: 'Info Alert',
    message: 'System update available',
    severity: 'info',
    status: 'acknowledged',
    integrationId: 'integration-2',
    timestamp: new Date().toISOString(),
    acknowledgedBy: 'user123',
    acknowledgedAt: new Date().toISOString()
  }
];

describe('useAlerts', () => {
  let wrapper;
  
  const TestComponent = defineComponent({
    props: ['integrationId'],
    setup(props) {
      return useAlerts(props.integrationId);
    },
    template: '<div>Test</div>'
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockAlertsService.getAlerts.mockResolvedValue(mockAlerts);
    mockAlertsService.getAlertsByIntegration.mockResolvedValue(mockAlerts.filter(a => a.integrationId === 'integration-1'));
  });

  it('should provide reactive alerts state', () => {
    wrapper = mount(TestComponent);
    const result = wrapper.vm.$options.setup();
    
    expect(result.alerts).toBeDefined();
    expect(result.loading).toBeDefined();
    expect(result.error).toBeDefined();
    expect(result.hasError).toBeDefined();
  });

  it('should provide computed alert filters', () => {
    wrapper = mount(TestComponent);
    const result = wrapper.vm.$options.setup();
    
    expect(result.activeAlerts).toBeDefined();
    expect(result.criticalAlerts).toBeDefined();
    expect(result.highPriorityAlerts).toBeDefined();
    expect(result.acknowledgedAlerts).toBeDefined();
    expect(result.resolvedAlerts).toBeDefined();
  });

  it('should fetch all alerts when no integrationId provided', async () => {
    wrapper = mount(TestComponent);
    const { fetchAlerts } = wrapper.vm.$options.setup();
    
    await fetchAlerts();
    
    expect(mockAlertsService.getAlerts).toHaveBeenCalled();
  });

  it('should fetch integration-specific alerts when integrationId provided', async () => {
    wrapper = mount(TestComponent, {
      props: { integrationId: 'integration-1' }
    });
    const { fetchAlerts } = wrapper.vm.$options.setup();
    
    await fetchAlerts();
    
    expect(mockAlertsService.getAlertsByIntegration).toHaveBeenCalledWith('integration-1');
  });

  it('should update alerts state after fetching', async () => {
    wrapper = mount(TestComponent);
    const { fetchAlerts, alerts, loading } = wrapper.vm.$options.setup();
    
    expect(loading.value).toBe(false);
    
    const promise = fetchAlerts();
    expect(loading.value).toBe(true);
    
    await promise;
    
    expect(alerts.value).toEqual(mockAlerts);
    expect(loading.value).toBe(false);
  });

  it('should handle fetch errors', async () => {
    mockAlertsService.getAlerts.mockRejectedValueOnce(new Error('Network error'));
    
    wrapper = mount(TestComponent);
    const { fetchAlerts, error, hasError } = wrapper.vm.$options.setup();
    
    await fetchAlerts();
    
    expect(error.value).toBeInstanceOf(Error);
    expect(error.value.message).toBe('Network error');
    expect(hasError.value).toBe(true);
  });

  it('should create new alert', async () => {
    const newAlert = {
      title: 'New Alert',
      message: 'New alert message',
      severity: 'medium',
      integrationId: 'integration-1'
    };
    
    mockAlertsService.createAlert.mockResolvedValueOnce({ id: '4', ...newAlert, status: 'active' });
    
    wrapper = mount(TestComponent);
    const { createAlert } = wrapper.vm.$options.setup();
    
    const result = await createAlert(newAlert);
    
    expect(mockAlertsService.createAlert).toHaveBeenCalledWith(newAlert);
    expect(result).toHaveProperty('id', '4');
  });

  it('should acknowledge alert', async () => {
    mockAlertsService.acknowledgeAlert.mockResolvedValueOnce({
      ...mockAlerts[0],
      status: 'acknowledged',
      acknowledgedBy: 'user123',
      acknowledgedAt: new Date().toISOString()
    });
    
    wrapper = mount(TestComponent);
    const { acknowledgeAlert, alerts } = wrapper.vm.$options.setup();
    
    alerts.value = [...mockAlerts];
    
    await acknowledgeAlert('1', 'user123');
    
    expect(mockAlertsService.acknowledgeAlert).toHaveBeenCalledWith('1', 'user123');
    expect(alerts.value[0].status).toBe('acknowledged');
  });

  it('should resolve alert', async () => {
    mockAlertsService.resolveAlert.mockResolvedValueOnce({
      ...mockAlerts[0],
      status: 'resolved',
      resolvedBy: 'user123',
      resolvedAt: new Date().toISOString(),
      resolution: 'Fixed the issue'
    });
    
    wrapper = mount(TestComponent);
    const { resolveAlert, alerts } = wrapper.vm.$options.setup();
    
    alerts.value = [...mockAlerts];
    
    await resolveAlert('1', 'user123', 'Fixed the issue');
    
    expect(mockAlertsService.resolveAlert).toHaveBeenCalledWith('1', 'user123', 'Fixed the issue');
    expect(alerts.value[0].status).toBe('resolved');
  });

  it('should delete alert', async () => {
    mockAlertsService.deleteAlert.mockResolvedValueOnce({ success: true });
    
    wrapper = mount(TestComponent);
    const { deleteAlert, alerts } = wrapper.vm.$options.setup();
    
    alerts.value = [...mockAlerts];
    
    await deleteAlert('1');
    
    expect(mockAlertsService.deleteAlert).toHaveBeenCalledWith('1');
    expect(alerts.value).toHaveLength(2);
    expect(alerts.value.find(a => a.id === '1')).toBeUndefined();
  });

  it('should filter alerts by severity', () => {
    wrapper = mount(TestComponent);
    const { filterBySeverity, alerts } = wrapper.vm.$options.setup();
    
    alerts.value = [...mockAlerts];
    
    const criticalAlerts = filterBySeverity('critical');
    expect(criticalAlerts).toHaveLength(1);
    expect(criticalAlerts[0].severity).toBe('critical');
    
    const highAlerts = filterBySeverity('high');
    expect(highAlerts).toHaveLength(1);
    expect(highAlerts[0].severity).toBe('high');
  });

  it('should filter alerts by status', () => {
    wrapper = mount(TestComponent);
    const { filterByStatus, alerts } = wrapper.vm.$options.setup();
    
    alerts.value = [...mockAlerts];
    
    const activeAlerts = filterByStatus('active');
    expect(activeAlerts).toHaveLength(2);
    
    const acknowledgedAlerts = filterByStatus('acknowledged');
    expect(acknowledgedAlerts).toHaveLength(1);
    expect(acknowledgedAlerts[0].status).toBe('acknowledged');
  });

  it('should compute active alerts', () => {
    wrapper = mount(TestComponent);
    const { activeAlerts, alerts } = wrapper.vm.$options.setup();
    
    alerts.value = [...mockAlerts];
    
    expect(activeAlerts.value).toHaveLength(2);
    expect(activeAlerts.value.every(a => a.status === 'active')).toBe(true);
  });

  it('should compute critical alerts', () => {
    wrapper = mount(TestComponent);
    const { criticalAlerts, alerts } = wrapper.vm.$options.setup();
    
    alerts.value = [...mockAlerts];
    
    expect(criticalAlerts.value).toHaveLength(1);
    expect(criticalAlerts.value[0].severity).toBe('critical');
  });

  it('should compute high priority alerts', () => {
    wrapper = mount(TestComponent);
    const { highPriorityAlerts, alerts } = wrapper.vm.$options.setup();
    
    alerts.value = [...mockAlerts];
    
    expect(highPriorityAlerts.value).toHaveLength(2); // critical + high
    expect(highPriorityAlerts.value.every(a => ['critical', 'high'].includes(a.severity))).toBe(true);
  });

  it('should clear error', () => {
    wrapper = mount(TestComponent);
    const { error, clearError } = wrapper.vm.$options.setup();
    
    error.value = new Error('Test error');
    clearError();
    
    expect(error.value).toBe(null);
  });

  it('should handle empty integrationId', async () => {
    wrapper = mount(TestComponent, {
      props: { integrationId: '' }
    });
    const { fetchAlerts } = wrapper.vm.$options.setup();
    
    await fetchAlerts();
    
    expect(mockAlertsService.getAlerts).toHaveBeenCalled();
    expect(mockAlertsService.getAlertsByIntegration).not.toHaveBeenCalled();
  });

  it('should update existing alert in state', async () => {
    wrapper = mount(TestComponent);
    const { updateAlert, alerts } = wrapper.vm.$options.setup();
    
    alerts.value = [...mockAlerts];
    
    const updatedData = { title: 'Updated Title' };
    mockAlertsService.updateAlert.mockResolvedValueOnce({
      ...mockAlerts[0],
      ...updatedData
    });
    
    await updateAlert('1', updatedData);
    
    expect(mockAlertsService.updateAlert).toHaveBeenCalledWith('1', updatedData);
    expect(alerts.value[0].title).toBe('Updated Title');
  });

  it('should handle concurrent operations', async () => {
    wrapper = mount(TestComponent);
    const { fetchAlerts, createAlert, loading } = wrapper.vm.$options.setup();
    
    // Start multiple operations
    const fetchPromise = fetchAlerts();
    const createPromise = createAlert({ title: 'New', severity: 'low' });
    
    expect(loading.value).toBe(true);
    
    await Promise.all([fetchPromise, createPromise]);
    
    expect(loading.value).toBe(false);
  });
});