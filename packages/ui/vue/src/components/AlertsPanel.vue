<template>
  <div class="alerts-panel">
    <div class="alerts-header">
      <h3>System Alerts</h3>
      <div class="alerts-summary">
        <span class="alert-count active">
          {{ activeAlerts.length }} Active
        </span>
        <span class="alert-count critical" v-if="criticalAlerts.length > 0">
          {{ criticalAlerts.length }} Critical
        </span>
      </div>
    </div>

    <div class="alerts-controls">
      <button @click="refreshAlerts" :disabled="loading">
        {{ loading ? 'Loading...' : 'Refresh' }}
      </button>
      <select v-model="selectedSeverity" @change="filterAlerts">
        <option value="">All Severities</option>
        <option value="critical">Critical</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
        <option value="info">Info</option>
      </select>
      <select v-model="selectedStatus" @change="filterAlerts">
        <option value="">All Status</option>
        <option value="active">Active</option>
        <option value="acknowledged">Acknowledged</option>
        <option value="resolved">Resolved</option>
      </select>
    </div>

    <div v-if="hasError" class="error-message">
      <strong>Error:</strong> {{ error?.message || 'Failed to load alerts' }}
      <button @click="clearError" class="error-dismiss">×</button>
    </div>

    <div v-if="loading && alerts.length === 0" class="loading">
      Loading alerts...
    </div>

    <div v-else-if="filteredAlerts.length === 0" class="empty-state">
      {{ alerts.length === 0 ? 'No alerts found' : 'No alerts match current filters' }}
    </div>

    <div v-else class="alerts-list">
      <div 
        v-for="alert in filteredAlerts" 
        :key="alert.id"
        :class="['alert-item', `severity-${alert.severity}`, `status-${alert.status}`]"
      >
        <div class="alert-header">
          <div class="alert-severity">
            <span :class="['severity-badge', alert.severity]">
              {{ alert.severity }}
            </span>
            <span :class="['status-badge', alert.status]">
              {{ alert.status }}
            </span>
          </div>
          <div class="alert-timestamp">
            {{ formatTimestamp(alert.timestamp || alert.createdAt) }}
          </div>
        </div>

        <div class="alert-content">
          <h4 class="alert-title">{{ alert.title || alert.message }}</h4>
          <p v-if="alert.description" class="alert-description">
            {{ alert.description }}
          </p>
          <div v-if="alert.metadata" class="alert-metadata">
            <strong>Details:</strong>
            <pre>{{ JSON.stringify(alert.metadata, null, 2) }}</pre>
          </div>
        </div>

        <div class="alert-actions" v-if="alert.status === 'active'">
          <button 
            @click="acknowledgeAlertAction(alert)" 
            class="btn-secondary"
            :disabled="loading"
          >
            Acknowledge
          </button>
          <button 
            @click="resolveAlertAction(alert)" 
            class="btn-primary"
            :disabled="loading"
          >
            Resolve
          </button>
        </div>

        <div v-else-if="alert.acknowledgedBy" class="alert-acknowledgment">
          Acknowledged by {{ alert.acknowledgedBy }} 
          {{ formatTimestamp(alert.acknowledgedAt) }}
        </div>

        <div v-else-if="alert.resolvedBy" class="alert-resolution">
          Resolved by {{ alert.resolvedBy }} 
          {{ formatTimestamp(alert.resolvedAt) }}
          <p v-if="alert.resolution">Resolution: {{ alert.resolution }}</p>
        </div>
      </div>
    </div>

    <!-- Resolution modal -->
    <div v-if="showResolveModal" class="modal-overlay" @click="cancelResolve">
      <div class="modal" @click.stop>
        <h4>Resolve Alert</h4>
        <p>{{ resolveCandidate?.title }}</p>
        <textarea 
          v-model="resolutionText"
          placeholder="Enter resolution details..."
          rows="4"
          class="resolution-textarea"
        ></textarea>
        <div class="modal-actions">
          <button @click="cancelResolve" class="btn-secondary">Cancel</button>
          <button @click="confirmResolve" class="btn-primary">Resolve</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted } from 'vue';
import { useAlerts } from '../composables/useAlerts.js';
import { useToast } from '../composables/useToast.js';

export default {
  name: 'AlertsPanel',
  props: {
    integrationId: {
      type: String,
      default: null
    }
  },
  setup(props) {
    const selectedSeverity = ref('');
    const selectedStatus = ref('');
    const showResolveModal = ref(false);
    const resolveCandidate = ref(null);
    const resolutionText = ref('');

    const {
      alerts,
      loading,
      error,
      hasError,
      activeAlerts,
      criticalAlerts,
      fetchAlerts,
      acknowledgeAlert,
      resolveAlert,
      filterBySeverity,
      filterByStatus,
      clearError
    } = useAlerts(props.integrationId);

    const { success, error: showError } = useToast();

    // Computed filtered alerts
    const filteredAlerts = computed(() => {
      let filtered = [...alerts.value];

      if (selectedSeverity.value) {
        filtered = filterBySeverity(selectedSeverity.value);
      }

      if (selectedStatus.value) {
        filtered = filterByStatus(selectedStatus.value);
      }

      return filtered.sort((a, b) => {
        const timeA = new Date(a.timestamp || a.createdAt);
        const timeB = new Date(b.timestamp || b.createdAt);
        return timeB - timeA; // Most recent first
      });
    });

    // Actions
    const refreshAlerts = async () => {
      try {
        await fetchAlerts();
        success('Alerts refreshed');
      } catch (err) {
        showError('Failed to refresh alerts');
      }
    };

    const filterAlerts = () => {
      // Reactive computed will handle the filtering
    };

    const acknowledgeAlertAction = async (alert) => {
      try {
        await acknowledgeAlert(alert.id, 'current-user'); // In real app, get actual user ID
        success('Alert acknowledged');
      } catch (err) {
        showError('Failed to acknowledge alert');
      }
    };

    const resolveAlertAction = (alert) => {
      resolveCandidate.value = alert;
      resolutionText.value = '';
      showResolveModal.value = true;
    };

    const cancelResolve = () => {
      showResolveModal.value = false;
      resolveCandidate.value = null;
      resolutionText.value = '';
    };

    const confirmResolve = async () => {
      if (!resolveCandidate.value) return;

      try {
        await resolveAlert(
          resolveCandidate.value.id, 
          'current-user', // In real app, get actual user ID
          resolutionText.value || 'Resolved manually'
        );
        success('Alert resolved');
        cancelResolve();
      } catch (err) {
        showError('Failed to resolve alert');
      }
    };

    // Utility functions
    const formatTimestamp = (timestamp) => {
      try {
        return new Date(timestamp).toLocaleString();
      } catch {
        return 'Invalid date';
      }
    };

    // Initialize
    onMounted(() => {
      if (props.integrationId) {
        refreshAlerts();
      }
    });

    return {
      alerts,
      loading,
      error,
      hasError,
      activeAlerts,
      criticalAlerts,
      filteredAlerts,
      selectedSeverity,
      selectedStatus,
      showResolveModal,
      resolveCandidate,
      resolutionText,
      refreshAlerts,
      filterAlerts,
      acknowledgeAlertAction,
      resolveAlertAction,
      cancelResolve,
      confirmResolve,
      clearError,
      formatTimestamp
    };
  }
};
</script>

<style scoped>
.alerts-panel {
  padding: 20px;
}

.alerts-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.alerts-summary {
  display: flex;
  gap: 12px;
}

.alert-count {
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: bold;
}

.alert-count.active {
  background: #d4edda;
  color: #155724;
}

.alert-count.critical {
  background: #f8d7da;
  color: #721c24;
}

.alerts-controls {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  align-items: center;
}

.alerts-controls select {
  padding: 6px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.error-message {
  background: #f8d7da;
  color: #721c24;
  padding: 12px;
  border-radius: 4px;
  margin-bottom: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.loading, .empty-state {
  text-align: center;
  padding: 40px;
  color: #6c757d;
}

.alerts-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
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

.alert-item.severity-high {
  border-left-color: #fd7e14;
}

.alert-item.severity-medium {
  border-left-color: #ffc107;
}

.alert-item.severity-low {
  border-left-color: #20c997;
}

.alert-item.severity-info {
  border-left-color: #17a2b8;
}

.alert-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.alert-severity {
  display: flex;
  gap: 8px;
}

.severity-badge, .status-badge {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: bold;
  text-transform: uppercase;
}

.severity-badge.critical {
  background: #dc3545;
  color: white;
}

.severity-badge.high {
  background: #fd7e14;
  color: white;
}

.severity-badge.medium {
  background: #ffc107;
  color: black;
}

.severity-badge.low {
  background: #20c997;
  color: white;
}

.severity-badge.info {
  background: #17a2b8;
  color: white;
}

.status-badge.active {
  background: #f8d7da;
  color: #721c24;
}

.status-badge.acknowledged {
  background: #fff3cd;
  color: #856404;
}

.status-badge.resolved {
  background: #d4edda;
  color: #155724;
}

.alert-timestamp {
  font-size: 12px;
  color: #6c757d;
}

.alert-title {
  margin: 0 0 8px 0;
  color: #343a40;
}

.alert-description {
  margin: 0 0 12px 0;
  color: #6c757d;
}

.alert-metadata {
  background: #f8f9fa;
  padding: 8px;
  border-radius: 4px;
  margin: 8px 0;
}

.alert-metadata pre {
  margin: 4px 0 0 0;
  font-size: 11px;
  white-space: pre-wrap;
}

.alert-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.alert-acknowledgment, .alert-resolution {
  margin-top: 12px;
  padding: 8px;
  background: #f8f9fa;
  border-radius: 4px;
  font-size: 12px;
  color: #6c757d;
}

button {
  padding: 6px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: #007bff;
  color: white;
  border-color: #007bff;
}

.btn-secondary {
  background: #6c757d;
  color: white;
  border-color: #6c757d;
}

button:hover:not(:disabled) {
  opacity: 0.9;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  padding: 24px;
  border-radius: 8px;
  max-width: 500px;
  width: 90%;
}

.modal h4 {
  margin-top: 0;
}

.resolution-textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  resize: vertical;
  font-family: inherit;
}

.modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 20px;
}
</style>