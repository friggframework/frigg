<!--
Example Vue.js application demonstrating @friggframework/ui-vue integration
This file shows how to use the Vue bindings with ui-core
-->

<template>
  <div class="frigg-vue-demo">
    <header class="demo-header">
      <h1>@friggframework/ui-vue Demo</h1>
      <p>Vue.js bindings for Frigg Framework UI Core</p>
    </header>

    <nav class="demo-nav">
      <button 
        v-for="tab in tabs" 
        :key="tab.id"
        @click="activeTab = tab.id"
        :class="['nav-button', { active: activeTab === tab.id }]"
      >
        {{ tab.label }}
      </button>
    </nav>

    <main class="demo-content">
      <!-- Core Status -->
      <section v-if="activeTab === 'core'" class="demo-section">
        <h2>Core Status</h2>
        <div class="status-grid">
          <div class="status-card">
            <h3>Initialization</h3>
            <p :class="isInitialized ? 'status-success' : 'status-error'">
              {{ isInitialized ? 'Initialized' : 'Not Initialized' }}
            </p>
            <button @click="initialize" :disabled="isInitialized">
              Initialize Core
            </button>
          </div>
          
          <div class="status-card">
            <h3>Services</h3>
            <ul>
              <li>Toast Manager: {{ getToastManager() ? '✓' : '✗' }}</li>
              <li>API Service: {{ getApiService() ? '✓' : '✗' }}</li>
              <li>Alerts Service: {{ getAlertsService() ? '✓' : '✗' }}</li>
              <li>CloudWatch: {{ getCloudWatchService() ? '✓' : '✗' }}</li>
            </ul>
          </div>

          <div class="status-card">
            <h3>Configuration</h3>
            <pre>{{ JSON.stringify(coreConfig, null, 2) }}</pre>
            <button @click="updateCoreConfig">Update Config</button>
          </div>
        </div>
      </section>

      <!-- Toast Demo -->
      <section v-if="activeTab === 'toasts'" class="demo-section">
        <ToastDemo />
      </section>

      <!-- Integrations Demo -->
      <section v-if="activeTab === 'integrations'" class="demo-section">
        <h2>Integration Management</h2>
        <div class="integration-demo">
          <div class="demo-controls">
            <button @click="loadMockIntegrations">Load Mock Data</button>
            <button @click="clearIntegrations">Clear Data</button>
            <span v-if="loading" class="loading-indicator">Loading...</span>
          </div>
          
          <div v-if="hasError" class="error-display">
            <strong>Error:</strong> {{ error?.message }}
            <button @click="clearError">Dismiss</button>
          </div>

          <div class="integrations-grid">
            <div 
              v-for="integration in mockIntegrations" 
              :key="integration.id"
              class="integration-card"
            >
              <h4>{{ integration.name }}</h4>
              <p>{{ integration.description }}</p>
              <span :class="['status', integration.status]">
                {{ integration.status }}
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- Alerts Demo -->
      <section v-if="activeTab === 'alerts'" class="demo-section">
        <h2>Alerts Management</h2>
        <div class="alerts-demo">
          <div class="demo-controls">
            <button @click="createMockAlert('critical')">Add Critical Alert</button>
            <button @click="createMockAlert('warning')">Add Warning</button>
            <button @click="createMockAlert('info')">Add Info</button>
            <button @click="clearAllAlerts">Clear All</button>
          </div>

          <div class="alerts-summary">
            <div class="alert-count">
              Total: {{ mockAlerts.length }}
            </div>
            <div class="alert-count critical">
              Critical: {{ mockAlerts.filter(a => a.severity === 'critical').length }}
            </div>
            <div class="alert-count active">
              Active: {{ mockAlerts.filter(a => a.status === 'active').length }}
            </div>
          </div>

          <div class="alerts-list">
            <div 
              v-for="alert in mockAlerts" 
              :key="alert.id"
              :class="['alert-item', `severity-${alert.severity}`]"
            >
              <div class="alert-header">
                <span class="alert-severity">{{ alert.severity }}</span>
                <span class="alert-time">{{ formatTime(alert.timestamp) }}</span>
              </div>
              <h4>{{ alert.title }}</h4>
              <p>{{ alert.description }}</p>
              <div class="alert-actions">
                <button 
                  @click="acknowledgeAlert(alert)" 
                  v-if="alert.status === 'active'"
                  class="btn-small"
                >
                  Acknowledge
                </button>
                <button 
                  @click="resolveAlert(alert)" 
                  v-if="alert.status === 'active'"
                  class="btn-small"
                >
                  Resolve
                </button>
                <button 
                  @click="removeAlert(alert)"
                  class="btn-small btn-danger"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- API Demo -->
      <section v-if="activeTab === 'api'" class="demo-section">
        <h2>API Client Demo</h2>
        <div class="api-demo">
          <div class="demo-controls">
            <input 
              v-model="apiTestUrl" 
              placeholder="API endpoint to test"
              class="api-input"
            />
            <button @click="testApiCall" :disabled="loading">
              {{ loading ? 'Testing...' : 'Test API Call' }}
            </button>
          </div>

          <div v-if="apiResult" class="api-result">
            <h4>API Response:</h4>
            <pre>{{ JSON.stringify(apiResult, null, 2) }}</pre>
          </div>

          <div v-if="hasError" class="error-display">
            <strong>API Error:</strong> {{ error?.message }}
            <button @click="clearError">Clear Error</button>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<script>
import { ref, computed } from 'vue';
import { 
  useFriggCore, 
  useToast, 
  useApiClient, 
  useAlerts,
  ToastDemo 
} from '@friggframework/ui-vue';

export default {
  name: 'FriggVueDemo',
  components: {
    ToastDemo
  },
  setup() {
    const activeTab = ref('core');
    const mockIntegrations = ref([]);
    const mockAlerts = ref([]);
    const apiTestUrl = ref('/api/integrations');
    const apiResult = ref(null);

    // Core management
    const {
      core,
      isInitialized,
      error: coreError,
      initialize,
      updateConfig,
      getToastManager,
      getApiService,
      getAlertsService,
      getCloudWatchService
    } = useFriggCore();

    // Toast management
    const { success, error: showError, warning, info } = useToast();

    // API management
    const {
      loading,
      error: apiError,
      hasError,
      listIntegrations,
      clearError
    } = useApiClient();

    // Alerts management
    const { createAlert } = useAlerts();

    // Computed properties
    const error = computed(() => coreError.value || apiError.value);
    const coreConfig = computed(() => core.value?.config || {});

    // Demo tabs
    const tabs = [
      { id: 'core', label: 'Core Status' },
      { id: 'toasts', label: 'Toast Demo' },
      { id: 'integrations', label: 'Integrations' },
      { id: 'alerts', label: 'Alerts' },
      { id: 'api', label: 'API Client' }
    ];

    // Demo functions
    const updateCoreConfig = () => {
      updateConfig({
        api: {
          baseUrl: 'https://demo.frigg.dev',
          timeout: 10000
        }
      });
      success('Configuration updated');
    };

    const loadMockIntegrations = () => {
      mockIntegrations.value = [
        {
          id: '1',
          name: 'HubSpot → Salesforce',
          description: 'Sync contacts and deals between platforms',
          status: 'active'
        },
        {
          id: '2',
          name: 'Slack → Zendesk',
          description: 'Create tickets from Slack messages',
          status: 'inactive'
        },
        {
          id: '3',
          name: 'GitHub → Jira',
          description: 'Sync issues and pull requests',
          status: 'active'
        }
      ];
      success('Mock integrations loaded');
    };

    const clearIntegrations = () => {
      mockIntegrations.value = [];
      info('Integrations cleared');
    };

    const createMockAlert = (severity) => {
      const alertId = Date.now().toString();
      const alert = {
        id: alertId,
        title: `${severity.charAt(0).toUpperCase() + severity.slice(1)} Alert`,
        description: `This is a mock ${severity} alert for demonstration`,
        severity,
        status: 'active',
        timestamp: new Date().toISOString()
      };
      mockAlerts.value.unshift(alert);
      showError(`New ${severity} alert created`);
    };

    const acknowledgeAlert = (alert) => {
      const index = mockAlerts.value.findIndex(a => a.id === alert.id);
      if (index !== -1) {
        mockAlerts.value[index] = {
          ...alert,
          status: 'acknowledged',
          acknowledgedAt: new Date().toISOString()
        };
        success('Alert acknowledged');
      }
    };

    const resolveAlert = (alert) => {
      const index = mockAlerts.value.findIndex(a => a.id === alert.id);
      if (index !== -1) {
        mockAlerts.value[index] = {
          ...alert,
          status: 'resolved',
          resolvedAt: new Date().toISOString()
        };
        success('Alert resolved');
      }
    };

    const removeAlert = (alert) => {
      mockAlerts.value = mockAlerts.value.filter(a => a.id !== alert.id);
      warning('Alert removed');
    };

    const clearAllAlerts = () => {
      mockAlerts.value = [];
      info('All alerts cleared');
    };

    const testApiCall = async () => {
      try {
        // Mock API response for demo
        apiResult.value = {
          success: true,
          data: [
            { id: 1, name: 'Test Integration 1' },
            { id: 2, name: 'Test Integration 2' }
          ],
          timestamp: new Date().toISOString()
        };
        success('API call successful');
      } catch (err) {
        showError('API call failed');
      }
    };

    const formatTime = (timestamp) => {
      return new Date(timestamp).toLocaleTimeString();
    };

    return {
      // State
      activeTab,
      tabs,
      mockIntegrations,
      mockAlerts,
      apiTestUrl,
      apiResult,
      
      // Core
      core,
      isInitialized,
      error,
      coreConfig,
      initialize,
      updateCoreConfig,
      getToastManager,
      getApiService,
      getAlertsService,
      getCloudWatchService,
      
      // API
      loading,
      hasError,
      clearError,
      
      // Demo functions
      loadMockIntegrations,
      clearIntegrations,
      createMockAlert,
      acknowledgeAlert,
      resolveAlert,
      removeAlert,
      clearAllAlerts,
      testApiCall,
      formatTime
    };
  }
};
</script>

<style scoped>
.frigg-vue-demo {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.demo-header {
  text-align: center;
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 1px solid #e9ecef;
}

.demo-header h1 {
  margin: 0 0 8px 0;
  color: #343a40;
}

.demo-header p {
  margin: 0;
  color: #6c757d;
}

.demo-nav {
  display: flex;
  gap: 8px;
  margin-bottom: 30px;
  border-bottom: 1px solid #e9ecef;
}

.nav-button {
  padding: 12px 20px;
  border: none;
  background: none;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}

.nav-button:hover {
  background: #f8f9fa;
}

.nav-button.active {
  border-bottom-color: #007bff;
  color: #007bff;
}

.demo-section {
  margin-bottom: 40px;
}

.demo-section h2 {
  margin-bottom: 20px;
  color: #343a40;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
}

.status-card {
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 20px;
  background: white;
}

.status-card h3 {
  margin: 0 0 12px 0;
  color: #495057;
}

.status-success {
  color: #28a745;
  font-weight: bold;
}

.status-error {
  color: #dc3545;
  font-weight: bold;
}

.demo-controls {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  align-items: center;
  flex-wrap: wrap;
}

.loading-indicator {
  color: #007bff;
  font-style: italic;
}

.error-display {
  background: #f8d7da;
  color: #721c24;
  padding: 12px;
  border-radius: 4px;
  margin-bottom: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.integrations-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 16px;
}

.integration-card {
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 16px;
  background: white;
}

.integration-card h4 {
  margin: 0 0 8px 0;
  color: #343a40;
}

.integration-card p {
  margin: 0 0 12px 0;
  color: #6c757d;
  font-size: 14px;
}

.status.active {
  background: #d4edda;
  color: #155724;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
}

.status.inactive {
  background: #f8d7da;
  color: #721c24;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
}

.alerts-summary {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
}

.alert-count {
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: bold;
  background: #e9ecef;
  color: #495057;
}

.alert-count.critical {
  background: #f8d7da;
  color: #721c24;
}

.alert-count.active {
  background: #fff3cd;
  color: #856404;
}

.alerts-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.alert-item {
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 16px;
  background: white;
  border-left: 4px solid #007bff;
}

.alert-item.severity-critical {
  border-left-color: #dc3545;
}

.alert-item.severity-warning {
  border-left-color: #ffc107;
}

.alert-item.severity-info {
  border-left-color: #17a2b8;
}

.alert-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.alert-severity {
  font-size: 12px;
  font-weight: bold;
  text-transform: uppercase;
}

.alert-time {
  font-size: 12px;
  color: #6c757d;
}

.alert-item h4 {
  margin: 0 0 8px 0;
  color: #343a40;
}

.alert-item p {
  margin: 0 0 12px 0;
  color: #6c757d;
}

.alert-actions {
  display: flex;
  gap: 8px;
}

.api-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.api-result {
  margin-top: 20px;
  background: #f8f9fa;
  padding: 16px;
  border-radius: 4px;
}

.api-result pre {
  margin: 8px 0 0 0;
  font-size: 12px;
  overflow-x: auto;
}

button {
  padding: 8px 16px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #f8f9fa;
  cursor: pointer;
  transition: all 0.2s;
}

button:hover:not(:disabled) {
  background: #e9ecef;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-small {
  padding: 4px 8px;
  font-size: 12px;
}

.btn-danger {
  background: #dc3545;
  color: white;
  border-color: #dc3545;
}

.btn-danger:hover:not(:disabled) {
  background: #c82333;
}

pre {
  background: #f8f9fa;
  padding: 12px;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 12px;
}

ul {
  margin: 0;
  padding-left: 20px;
}

li {
  margin-bottom: 4px;
}
</style>