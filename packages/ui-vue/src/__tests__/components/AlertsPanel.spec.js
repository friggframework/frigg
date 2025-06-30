import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import AlertsPanel from '../../components/AlertsPanel.vue';

// Mock composables
vi.mock('../../composables/useAlerts', () => ({
  useAlerts: vi.fn(() => ({
    alerts: { value: [] },
    loading: { value: false },
    error: { value: null },
    hasError: { value: false },
    activeAlerts: { value: [] },
    criticalAlerts: { value: [] },
    fetchAlerts: vi.fn(),
    acknowledgeAlert: vi.fn(),
    resolveAlert: vi.fn(),
    filterBySeverity: vi.fn((severity) => mockAlerts.filter(a => a.severity === severity)),
    filterByStatus: vi.fn((status) => mockAlerts.filter(a => a.status === status)),
    clearError: vi.fn()
  }))
}));

vi.mock('../../composables/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn()
  })
}));

const mockAlerts = [
  {
    id: '1',
    title: 'Critical Alert',
    description: 'System is down',
    severity: 'critical',
    status: 'active',
    timestamp: new Date().toISOString(),
    metadata: { service: 'api', region: 'us-east-1' }
  },
  {
    id: '2',
    title: 'High Priority Alert',
    description: 'High CPU usage',
    severity: 'high',
    status: 'active',
    timestamp: new Date().toISOString()
  },
  {
    id: '3',
    title: 'Resolved Alert',
    description: 'Previous issue',
    severity: 'medium',
    status: 'resolved',
    timestamp: new Date().toISOString(),
    resolvedBy: 'user123',
    resolvedAt: new Date().toISOString(),
    resolution: 'Restarted service'
  }
];

describe('AlertsPanel', () => {
  let wrapper;
  let useAlertsMock;
  let useToastMock;

  beforeEach(() => {
    vi.clearAllMocks();
    
    const { useAlerts } = require('../../composables/useAlerts');
    const { useToast } = require('../../composables/useToast');
    
    useAlertsMock = useAlerts();
    useToastMock = useToast();
  });

  it('should render alerts panel with header', () => {
    wrapper = mount(AlertsPanel);
    
    expect(wrapper.find('.alerts-header').exists()).toBe(true);
    expect(wrapper.find('h3').text()).toBe('System Alerts');
  });

  it('should display alert counts', async () => {
    useAlertsMock.activeAlerts.value = mockAlerts.filter(a => a.status === 'active');
    useAlertsMock.criticalAlerts.value = mockAlerts.filter(a => a.severity === 'critical');
    
    wrapper = mount(AlertsPanel);
    await nextTick();
    
    expect(wrapper.find('.alert-count.active').text()).toBe('2 Active');
    expect(wrapper.find('.alert-count.critical').text()).toBe('1 Critical');
  });

  it('should render filter controls', () => {
    wrapper = mount(AlertsPanel);
    
    const selects = wrapper.findAll('select');
    expect(selects).toHaveLength(2);
    
    const severityOptions = selects[0].findAll('option');
    expect(severityOptions).toHaveLength(6); // All + 5 severity levels
    
    const statusOptions = selects[1].findAll('option');
    expect(statusOptions).toHaveLength(4); // All + 3 status types
  });

  it('should display loading state', async () => {
    useAlertsMock.loading.value = true;
    
    wrapper = mount(AlertsPanel);
    await nextTick();
    
    expect(wrapper.find('.loading').exists()).toBe(true);
    expect(wrapper.find('.loading').text()).toBe('Loading alerts...');
  });

  it('should display error state', async () => {
    useAlertsMock.hasError.value = true;
    useAlertsMock.error.value = new Error('Failed to fetch');
    
    wrapper = mount(AlertsPanel);
    await nextTick();
    
    expect(wrapper.find('.error-message').exists()).toBe(true);
    expect(wrapper.find('.error-message').text()).toContain('Failed to fetch');
  });

  it('should display empty state', async () => {
    useAlertsMock.alerts.value = [];
    
    wrapper = mount(AlertsPanel);
    await nextTick();
    
    expect(wrapper.find('.empty-state').exists()).toBe(true);
    expect(wrapper.find('.empty-state').text()).toBe('No alerts found');
  });

  it('should render alert items', async () => {
    useAlertsMock.alerts.value = mockAlerts;
    
    wrapper = mount(AlertsPanel);
    await nextTick();
    
    const alertItems = wrapper.findAll('.alert-item');
    expect(alertItems).toHaveLength(3);
    
    // Check first alert
    const firstAlert = alertItems[0];
    expect(firstAlert.find('.alert-title').text()).toBe('Critical Alert');
    expect(firstAlert.find('.alert-description').text()).toBe('System is down');
    expect(firstAlert.find('.severity-badge').text()).toBe('critical');
  });

  it('should show action buttons for active alerts', async () => {
    useAlertsMock.alerts.value = [mockAlerts[0]]; // Active alert
    
    wrapper = mount(AlertsPanel);
    await nextTick();
    
    const actions = wrapper.find('.alert-actions');
    expect(actions.exists()).toBe(true);
    expect(actions.find('.btn-secondary').text()).toBe('Acknowledge');
    expect(actions.find('.btn-primary').text()).toBe('Resolve');
  });

  it('should not show action buttons for resolved alerts', async () => {
    useAlertsMock.alerts.value = [mockAlerts[2]]; // Resolved alert
    
    wrapper = mount(AlertsPanel);
    await nextTick();
    
    expect(wrapper.find('.alert-actions').exists()).toBe(false);
    expect(wrapper.find('.alert-resolution').exists()).toBe(true);
  });

  it('should refresh alerts on button click', async () => {
    wrapper = mount(AlertsPanel, {
      props: { integrationId: 'test-integration' }
    });
    
    await wrapper.find('button').trigger('click');
    
    expect(useAlertsMock.fetchAlerts).toHaveBeenCalled();
    expect(useToastMock.success).toHaveBeenCalledWith('Alerts refreshed');
  });

  it('should acknowledge alert', async () => {
    useAlertsMock.alerts.value = [mockAlerts[0]];
    
    wrapper = mount(AlertsPanel);
    await nextTick();
    
    await wrapper.find('.btn-secondary').trigger('click');
    
    expect(useAlertsMock.acknowledgeAlert).toHaveBeenCalledWith('1', 'current-user');
    expect(useToastMock.success).toHaveBeenCalledWith('Alert acknowledged');
  });

  it('should open resolve modal', async () => {
    useAlertsMock.alerts.value = [mockAlerts[0]];
    
    wrapper = mount(AlertsPanel);
    await nextTick();
    
    await wrapper.find('.btn-primary').trigger('click');
    
    expect(wrapper.find('.modal-overlay').exists()).toBe(true);
    expect(wrapper.find('.modal h4').text()).toBe('Resolve Alert');
  });

  it('should resolve alert with resolution text', async () => {
    useAlertsMock.alerts.value = [mockAlerts[0]];
    
    wrapper = mount(AlertsPanel);
    await nextTick();
    
    // Open modal
    await wrapper.find('.btn-primary').trigger('click');
    
    // Enter resolution text
    await wrapper.find('.resolution-textarea').setValue('Fixed the issue');
    
    // Confirm resolve
    await wrapper.find('.modal .btn-primary').trigger('click');
    
    expect(useAlertsMock.resolveAlert).toHaveBeenCalledWith('1', 'current-user', 'Fixed the issue');
    expect(useToastMock.success).toHaveBeenCalledWith('Alert resolved');
    expect(wrapper.find('.modal-overlay').exists()).toBe(false);
  });

  it('should cancel resolve modal', async () => {
    useAlertsMock.alerts.value = [mockAlerts[0]];
    
    wrapper = mount(AlertsPanel);
    await nextTick();
    
    // Open modal
    await wrapper.find('.btn-primary').trigger('click');
    
    // Cancel
    await wrapper.find('.modal .btn-secondary').trigger('click');
    
    expect(wrapper.find('.modal-overlay').exists()).toBe(false);
    expect(useAlertsMock.resolveAlert).not.toHaveBeenCalled();
  });

  it('should filter alerts by severity', async () => {
    useAlertsMock.alerts.value = mockAlerts;
    useAlertsMock.filterBySeverity.mockReturnValue([mockAlerts[0]]);
    
    wrapper = mount(AlertsPanel);
    await nextTick();
    
    const severitySelect = wrapper.findAll('select')[0];
    await severitySelect.setValue('critical');
    
    expect(useAlertsMock.filterBySeverity).toHaveBeenCalledWith('critical');
  });

  it('should filter alerts by status', async () => {
    useAlertsMock.alerts.value = mockAlerts;
    useAlertsMock.filterByStatus.mockReturnValue([mockAlerts[2]]);
    
    wrapper = mount(AlertsPanel);
    await nextTick();
    
    const statusSelect = wrapper.findAll('select')[1];
    await statusSelect.setValue('resolved');
    
    expect(useAlertsMock.filterByStatus).toHaveBeenCalledWith('resolved');
  });

  it('should format timestamps correctly', async () => {
    const testDate = '2024-01-15T10:30:00Z';
    useAlertsMock.alerts.value = [{
      ...mockAlerts[0],
      timestamp: testDate
    }];
    
    wrapper = mount(AlertsPanel);
    await nextTick();
    
    const timestamp = wrapper.find('.alert-timestamp');
    expect(timestamp.text()).toContain('2024');
  });

  it('should display alert metadata', async () => {
    useAlertsMock.alerts.value = [mockAlerts[0]];
    
    wrapper = mount(AlertsPanel);
    await nextTick();
    
    const metadata = wrapper.find('.alert-metadata');
    expect(metadata.exists()).toBe(true);
    expect(metadata.text()).toContain('service');
    expect(metadata.text()).toContain('api');
  });

  it('should handle fetch error gracefully', async () => {
    useAlertsMock.fetchAlerts.mockRejectedValueOnce(new Error('Network error'));
    
    wrapper = mount(AlertsPanel, {
      props: { integrationId: 'test-integration' }
    });
    
    await wrapper.find('button').trigger('click');
    await nextTick();
    
    expect(useToastMock.error).toHaveBeenCalledWith('Failed to refresh alerts');
  });

  it('should clear error on dismiss', async () => {
    useAlertsMock.hasError.value = true;
    useAlertsMock.error.value = new Error('Test error');
    
    wrapper = mount(AlertsPanel);
    await nextTick();
    
    await wrapper.find('.error-dismiss').trigger('click');
    
    expect(useAlertsMock.clearError).toHaveBeenCalled();
  });

  it('should auto-fetch alerts on mount with integrationId', async () => {
    mount(AlertsPanel, {
      props: { integrationId: 'test-integration' }
    });
    
    await nextTick();
    
    expect(useAlertsMock.fetchAlerts).toHaveBeenCalled();
  });
});