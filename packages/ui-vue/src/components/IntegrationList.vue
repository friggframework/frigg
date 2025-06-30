<template>
  <div class="integration-list">
    <h3>Integration Management</h3>
    
    <div class="controls">
      <button @click="refreshIntegrations" :disabled="loading">
        {{ loading ? 'Loading...' : 'Refresh' }}
      </button>
    </div>

    <div v-if="hasError" class="error-message">
      <strong>Error:</strong> {{ error?.message || 'Failed to load integrations' }}
      <button @click="clearError" class="error-dismiss">×</button>
    </div>

    <div v-if="loading && integrations.length === 0" class="loading">
      Loading integrations...
    </div>

    <div v-else-if="integrations.length === 0" class="empty-state">
      No integrations found. Create your first integration to get started.
    </div>

    <div v-else class="integration-grid">
      <div 
        v-for="integration in integrations" 
        :key="integration.id"
        class="integration-card"
      >
        <div class="integration-header">
          <h4>{{ integration.name || 'Unnamed Integration' }}</h4>
          <span :class="['status', integration.status || 'unknown']">
            {{ integration.status || 'Unknown' }}
          </span>
        </div>
        
        <div class="integration-details">
          <p v-if="integration.description">{{ integration.description }}</p>
          <div class="entities" v-if="integration.entities">
            <strong>Connected Services:</strong>
            <span 
              v-for="entity in integration.entities" 
              :key="entity.id || entity.name"
              class="entity-tag"
            >
              {{ entity.name || entity.type }}
            </span>
          </div>
          <div class="dates">
            <small v-if="integration.createdAt">
              Created: {{ formatDate(integration.createdAt) }}
            </small>
          </div>
        </div>

        <div class="integration-actions">
          <button @click="viewIntegration(integration)" class="btn-secondary">
            View
          </button>
          <button @click="editIntegration(integration)" class="btn-primary">
            Edit
          </button>
          <button 
            @click="deleteIntegrationConfirm(integration)" 
            class="btn-danger"
            :disabled="loading"
          >
            Delete
          </button>
        </div>
      </div>
    </div>

    <!-- Simple confirmation dialog -->
    <div v-if="showDeleteConfirm" class="modal-overlay" @click="cancelDelete">
      <div class="modal" @click.stop>
        <h4>Delete Integration</h4>
        <p>Are you sure you want to delete "{{ deleteCandidate?.name }}"?</p>
        <div class="modal-actions">
          <button @click="cancelDelete" class="btn-secondary">Cancel</button>
          <button @click="confirmDelete" class="btn-danger">Delete</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue';
import { useApiClient } from '../composables/useApiClient.js';
import { useToast } from '../composables/useToast.js';

export default {
  name: 'IntegrationList',
  setup() {
    const integrations = ref([]);
    const showDeleteConfirm = ref(false);
    const deleteCandidate = ref(null);

    const { 
      loading, 
      error, 
      hasError, 
      listIntegrations, 
      deleteIntegration,
      clearError 
    } = useApiClient();

    const { success, error: showError } = useToast();

    // Load integrations
    const refreshIntegrations = async () => {
      try {
        const result = await listIntegrations();
        integrations.value = result?.integrations || result || [];
        success('Integrations loaded successfully');
      } catch (err) {
        showError('Failed to load integrations');
      }
    };

    // Integration actions
    const viewIntegration = (integration) => {
      // Navigate to integration detail view
      console.log('View integration:', integration);
    };

    const editIntegration = (integration) => {
      // Navigate to integration edit form
      console.log('Edit integration:', integration);
    };

    const deleteIntegrationConfirm = (integration) => {
      deleteCandidate.value = integration;
      showDeleteConfirm.value = true;
    };

    const cancelDelete = () => {
      showDeleteConfirm.value = false;
      deleteCandidate.value = null;
    };

    const confirmDelete = async () => {
      if (!deleteCandidate.value) return;

      try {
        await deleteIntegration(deleteCandidate.value.id);
        integrations.value = integrations.value.filter(
          i => i.id !== deleteCandidate.value.id
        );
        success('Integration deleted successfully');
      } catch (err) {
        showError('Failed to delete integration');
      } finally {
        cancelDelete();
      }
    };

    // Utility functions
    const formatDate = (dateString) => {
      try {
        return new Date(dateString).toLocaleDateString();
      } catch {
        return 'Invalid date';
      }
    };

    // Initialize
    onMounted(() => {
      refreshIntegrations();
    });

    return {
      integrations,
      loading,
      error,
      hasError,
      showDeleteConfirm,
      deleteCandidate,
      refreshIntegrations,
      viewIntegration,
      editIntegration,
      deleteIntegrationConfirm,
      cancelDelete,
      confirmDelete,
      clearError,
      formatDate
    };
  }
};
</script>

<style scoped>
.integration-list {
  padding: 20px;
}

.controls {
  margin-bottom: 20px;
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

.error-dismiss {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
}

.loading, .empty-state {
  text-align: center;
  padding: 40px;
  color: #6c757d;
}

.integration-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.integration-card {
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 20px;
  background: white;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.integration-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.integration-header h4 {
  margin: 0;
  color: #343a40;
}

.status {
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: bold;
  text-transform: uppercase;
}

.status.active {
  background: #d4edda;
  color: #155724;
}

.status.inactive {
  background: #f8d7da;
  color: #721c24;
}

.status.unknown {
  background: #e2e3e5;
  color: #383d41;
}

.integration-details {
  margin-bottom: 16px;
}

.entities {
  margin: 8px 0;
}

.entity-tag {
  display: inline-block;
  background: #e9ecef;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  margin-right: 4px;
}

.dates {
  margin-top: 8px;
}

.integration-actions {
  display: flex;
  gap: 8px;
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

.btn-danger {
  background: #dc3545;
  color: white;
  border-color: #dc3545;
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
  max-width: 400px;
  width: 90%;
}

.modal h4 {
  margin-top: 0;
}

.modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 20px;
}
</style>