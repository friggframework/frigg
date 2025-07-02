<template>
  <div id="app">
    <!-- Provide Frigg context to entire app -->
    <ErrorBoundary 
      variant="full" 
      title="Application Error"
      @retry="initializeApp"
    >
      <div class="app-container">
        <!-- Header -->
        <header class="app-header">
          <h1>Frigg Integration Platform</h1>
          <div class="header-actions">
            <button @click="showSettings = true" class="btn-icon">
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path fill="currentColor" d="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z" />
              </svg>
            </button>
          </div>
        </header>

        <!-- Main Content -->
        <main class="app-main">
          <!-- Stats Overview -->
          <div class="stats-grid">
            <div class="stat-card">
              <h3>Active Integrations</h3>
              <p class="stat-value">{{ activeIntegrations.length }}</p>
            </div>
            <div class="stat-card">
              <h3>Total Alerts</h3>
              <p class="stat-value">{{ totalAlerts }}</p>
            </div>
            <div class="stat-card">
              <h3>API Calls Today</h3>
              <p class="stat-value">{{ formatNumber(apiCallsToday) }}</p>
            </div>
            <div class="stat-card">
              <h3>System Health</h3>
              <p class="stat-value" :class="healthClass">{{ systemHealth }}%</p>
            </div>
          </div>

          <!-- Integration Management -->
          <section class="section">
            <h2>Integrations</h2>
            
            <div v-if="loading" class="loading-container">
              <LoadingSpinner 
                size="large" 
                message="Loading integrations..." 
                variant="primary"
              />
            </div>

            <div v-else class="integrations-grid">
              <IntegrationCard
                v-for="integration in integrations"
                :key="integration.id"
                :integration="integration"
                :is-selected="selectedIntegration?.id === integration.id"
                @click="selectIntegration"
                @activate="activateIntegration"
                @configure="configureIntegration"
                @disconnect="disconnectIntegration"
              />
            </div>
          </section>

          <!-- Alerts Section -->
          <section v-if="selectedIntegration" class="section">
            <h2>Alerts for {{ selectedIntegration.name }}</h2>
            <AlertsPanel :integration-id="selectedIntegration.id" />
          </section>

          <!-- CloudWatch Metrics -->
          <section class="section">
            <h2>System Metrics</h2>
            <div class="metrics-grid">
              <div 
                v-for="metric in latestMetrics" 
                :key="metric.MetricName"
                class="metric-card"
              >
                <h4>{{ metric.MetricName }}</h4>
                <p class="metric-value">
                  {{ metric.Value }} {{ metric.Unit }}
                </p>
                <p class="metric-time">
                  {{ formatTime(metric.Timestamp) }}
                </p>
              </div>
            </div>
          </section>
        </main>

        <!-- Settings Modal -->
        <Modal
          v-model="showSettings"
          title="Application Settings"
          size="medium"
          @confirm="saveSettings"
        >
          <div class="settings-form">
            <div class="form-group">
              <label>API URL</label>
              <input 
                v-model="settings.apiUrl" 
                type="text" 
                placeholder="https://api.example.com"
              />
            </div>
            <div class="form-group">
              <label>Environment</label>
              <select v-model="settings.environment">
                <option value="development">Development</option>
                <option value="staging">Staging</option>
                <option value="production">Production</option>
              </select>
            </div>
            <div class="form-group">
              <label>Features</label>
              <div class="checkbox-group">
                <label>
                  <input 
                    v-model="settings.features.alerts" 
                    type="checkbox"
                  />
                  Enable Alerts
                </label>
                <label>
                  <input 
                    v-model="settings.features.cloudwatch" 
                    type="checkbox"
                  />
                  Enable CloudWatch
                </label>
                <label>
                  <input 
                    v-model="settings.features.toast" 
                    type="checkbox"
                  />
                  Enable Toast Notifications
                </label>
              </div>
            </div>
          </div>
        </Modal>

        <!-- Configuration Modal -->
        <Modal
          v-model="showConfig"
          :title="`Configure ${configIntegration?.name}`"
          size="large"
          @confirm="saveConfiguration"
        >
          <div class="config-form">
            <h3>Integration Configuration</h3>
            <p>Configure the settings for {{ configIntegration?.name }}</p>
            <!-- Add your configuration form here -->
          </div>
        </Modal>
      </div>
    </ErrorBoundary>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, reactive } from 'vue';
import {
  ErrorBoundary,
  LoadingSpinner,
  IntegrationCard,
  AlertsPanel,
  Modal,
  provideFrigg,
  useApiClient,
  useToast,
  useAlerts,
  useCloudWatch
} from '@friggframework/ui-vue';

// Provide Frigg context
const frigg = provideFrigg({
  apiUrl: import.meta.env.VITE_API_URL || 'https://api.example.com'
});

// Composables
const { get, post, loading } = useApiClient();
const { success, error, info } = useToast();
const { alerts, fetchAlerts } = useAlerts();
const { metrics, getMetrics, logMetric } = useCloudWatch('FriggApp/Production');

// State
const integrations = ref([]);
const selectedIntegration = ref(null);
const showSettings = ref(false);
const showConfig = ref(false);
const configIntegration = ref(null);
const apiCallsToday = ref(12543);
const systemHealth = ref(98);

const settings = reactive({
  apiUrl: import.meta.env.VITE_API_URL || 'https://api.example.com',
  environment: 'production',
  features: {
    alerts: true,
    cloudwatch: true,
    toast: true
  }
});

// Computed
const activeIntegrations = computed(() => 
  integrations.value.filter(i => i.status === 'active')
);

const totalAlerts = computed(() => alerts.value.length);

const latestMetrics = computed(() => metrics.value.slice(0, 4));

const healthClass = computed(() => {
  if (systemHealth.value >= 90) return 'health-good';
  if (systemHealth.value >= 70) return 'health-warning';
  return 'health-critical';
});

// Methods
const initializeApp = async () => {
  try {
    await fetchIntegrations();
    await fetchAlerts();
    await getMetrics();
    info('Application initialized');
  } catch (err) {
    error('Failed to initialize application');
    throw err;
  }
};

const fetchIntegrations = async () => {
  try {
    // Simulated data - replace with actual API call
    integrations.value = [
      {
        id: '1',
        name: 'Salesforce',
        description: 'Customer relationship management',
        status: 'active',
        icon: '/icons/salesforce.svg',
        lastSync: new Date().toISOString(),
        recordsProcessed: 15234,
        errorCount: 0,
        tags: ['CRM', 'Sales']
      },
      {
        id: '2',
        name: 'Slack',
        description: 'Team communication platform',
        status: 'active',
        icon: '/icons/slack.svg',
        lastSync: new Date().toISOString(),
        recordsProcessed: 8921,
        errorCount: 2,
        tags: ['Communication', 'Notifications']
      },
      {
        id: '3',
        name: 'GitHub',
        description: 'Version control and collaboration',
        status: 'inactive',
        icon: '/icons/github.svg',
        tags: ['Development', 'Version Control']
      }
    ];
  } catch (err) {
    error('Failed to load integrations');
  }
};

const selectIntegration = (integration) => {
  selectedIntegration.value = integration;
  logMetric('IntegrationSelected', 1, 'Count', {
    integration: integration.name
  });
};

const activateIntegration = async (integration) => {
  try {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    integration.status = 'active';
    success(`${integration.name} activated successfully`);
    logMetric('IntegrationActivated', 1, 'Count', {
      integration: integration.name
    });
  } catch (err) {
    error(`Failed to activate ${integration.name}`);
  }
};

const configureIntegration = (integration) => {
  configIntegration.value = integration;
  showConfig.value = true;
};

const disconnectIntegration = async (integration) => {
  try {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    integration.status = 'inactive';
    success(`${integration.name} disconnected`);
    logMetric('IntegrationDisconnected', 1, 'Count', {
      integration: integration.name
    });
  } catch (err) {
    error(`Failed to disconnect ${integration.name}`);
  }
};

const saveSettings = () => {
  frigg.updateConfig(settings);
  success('Settings saved successfully');
  showSettings.value = false;
};

const saveConfiguration = () => {
  success(`${configIntegration.value.name} configuration saved`);
  showConfig.value = false;
  configIntegration.value = null;
};

const formatNumber = (num) => {
  return new Intl.NumberFormat().format(num);
};

const formatTime = (timestamp) => {
  return new Date(timestamp).toLocaleTimeString();
};

// Initialize on mount
onMounted(() => {
  initializeApp();
});
</script>

<style>
/* Global Styles */
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  background: #f5f7fa;
  color: #333;
}

#app {
  min-height: 100vh;
}

/* Layout */
.app-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.app-header {
  background: white;
  border-bottom: 1px solid #e1e4e8;
  padding: 20px 40px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.app-header h1 {
  margin: 0;
  font-size: 24px;
  color: #24292e;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.btn-icon {
  width: 40px;
  height: 40px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid #e1e4e8;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-icon:hover {
  background: #f0f0f0;
  border-color: #d0d0d0;
}

.app-main {
  flex: 1;
  padding: 40px;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}

.section {
  margin-bottom: 60px;
}

.section h2 {
  margin: 0 0 24px 0;
  font-size: 20px;
  color: #24292e;
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-bottom: 40px;
}

.stat-card {
  background: white;
  border-radius: 8px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.stat-card h3 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 500;
  color: #586069;
  text-transform: uppercase;
}

.stat-value {
  margin: 0;
  font-size: 32px;
  font-weight: 600;
  color: #24292e;
}

.health-good {
  color: #28a745;
}

.health-warning {
  color: #ffc107;
}

.health-critical {
  color: #dc3545;
}

/* Integrations Grid */
.integrations-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 24px;
}

.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
}

/* Metrics Grid */
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.metric-card {
  background: white;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.metric-card h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: #586069;
}

.metric-value {
  margin: 0 0 4px 0;
  font-size: 20px;
  font-weight: 600;
  color: #24292e;
}

.metric-time {
  margin: 0;
  font-size: 12px;
  color: #959da5;
}

/* Forms */
.settings-form,
.config-form {
  padding: 20px 0;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #24292e;
}

.form-group input[type="text"],
.form-group select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #e1e4e8;
  border-radius: 6px;
  font-size: 14px;
}

.checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.checkbox-group label {
  display: flex;
  align-items: center;
  font-weight: normal;
  cursor: pointer;
}

.checkbox-group input[type="checkbox"] {
  margin-right: 8px;
}

/* Responsive */
@media (max-width: 768px) {
  .app-header {
    padding: 16px 20px;
  }
  
  .app-main {
    padding: 20px;
  }
  
  .stats-grid {
    grid-template-columns: 1fr;
  }
  
  .integrations-grid {
    grid-template-columns: 1fr;
  }
}
</style>