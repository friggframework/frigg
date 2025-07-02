<template>
  <div 
    :class="['integration-card', { 
      'active': isActive, 
      'disabled': isDisabled,
      'selected': isSelected 
    }]"
    @click="handleClick"
  >
    <div class="integration-header">
      <div class="integration-icon">
        <img v-if="integration.icon" :src="integration.icon" :alt="`${integration.name} icon`">
        <div v-else class="icon-placeholder">{{ getInitials(integration.name) }}</div>
      </div>
      <div class="integration-info">
        <h3 class="integration-name">{{ integration.name }}</h3>
        <p class="integration-description">{{ integration.description }}</p>
      </div>
      <div class="integration-status">
        <span :class="['status-badge', statusClass]">
          {{ statusText }}
        </span>
      </div>
    </div>

    <div v-if="showDetails" class="integration-details">
      <div class="detail-item" v-if="integration.lastSync">
        <span class="detail-label">Last Sync:</span>
        <span class="detail-value">{{ formatDate(integration.lastSync) }}</span>
      </div>
      <div class="detail-item" v-if="integration.recordsProcessed">
        <span class="detail-label">Records:</span>
        <span class="detail-value">{{ formatNumber(integration.recordsProcessed) }}</span>
      </div>
      <div class="detail-item" v-if="integration.errorCount !== undefined">
        <span class="detail-label">Errors:</span>
        <span class="detail-value" :class="{ 'has-errors': integration.errorCount > 0 }">
          {{ integration.errorCount }}
        </span>
      </div>
    </div>

    <div class="integration-actions">
      <slot name="actions" :integration="integration">
        <button 
          v-if="!isActive" 
          @click.stop="$emit('activate', integration)"
          class="btn-primary"
          :disabled="isDisabled"
        >
          Connect
        </button>
        <button 
          v-else 
          @click.stop="$emit('configure', integration)"
          class="btn-secondary"
        >
          Configure
        </button>
        <button 
          v-if="isActive" 
          @click.stop="$emit('disconnect', integration)"
          class="btn-danger"
        >
          Disconnect
        </button>
      </slot>
    </div>

    <div v-if="integration.tags && integration.tags.length > 0" class="integration-tags">
      <span 
        v-for="tag in integration.tags" 
        :key="tag"
        class="tag"
      >
        {{ tag }}
      </span>
    </div>
  </div>
</template>

<script>
import { computed } from 'vue';

export default {
  name: 'IntegrationCard',
  props: {
    integration: {
      type: Object,
      required: true,
      validator: (value) => {
        return value && typeof value.id !== 'undefined' && typeof value.name !== 'undefined';
      }
    },
    showDetails: {
      type: Boolean,
      default: true
    },
    isSelected: {
      type: Boolean,
      default: false
    }
  },
  emits: ['click', 'activate', 'configure', 'disconnect'],
  setup(props, { emit }) {
    const isActive = computed(() => {
      return props.integration.status === 'active' || props.integration.isActive === true;
    });

    const isDisabled = computed(() => {
      return props.integration.status === 'disabled' || props.integration.isDisabled === true;
    });

    const statusClass = computed(() => {
      const status = props.integration.status || 'inactive';
      return status.toLowerCase();
    });

    const statusText = computed(() => {
      if (isDisabled.value) return 'Disabled';
      if (isActive.value) return 'Active';
      return 'Inactive';
    });

    const handleClick = () => {
      if (!isDisabled.value) {
        emit('click', props.integration);
      }
    };

    const getInitials = (name) => {
      return name
        .split(' ')
        .map(word => word[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    };

    const formatDate = (date) => {
      try {
        return new Date(date).toLocaleString();
      } catch {
        return 'Invalid date';
      }
    };

    const formatNumber = (num) => {
      return new Intl.NumberFormat().format(num);
    };

    return {
      isActive,
      isDisabled,
      statusClass,
      statusText,
      handleClick,
      getInitials,
      formatDate,
      formatNumber
    };
  }
};
</script>

<style scoped>
.integration-card {
  border: 1px solid #e1e4e8;
  border-radius: 8px;
  padding: 20px;
  background: white;
  transition: all 0.2s ease;
  cursor: pointer;
}

.integration-card:hover:not(.disabled) {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.integration-card.active {
  border-color: #28a745;
}

.integration-card.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.integration-card.selected {
  border-color: #007bff;
  background: #f0f8ff;
}

.integration-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.integration-icon {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
}

.integration-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.icon-placeholder {
  width: 100%;
  height: 100%;
  background: #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  font-weight: bold;
  color: #666;
}

.integration-info {
  flex: 1;
}

.integration-name {
  margin: 0 0 4px 0;
  font-size: 18px;
  color: #24292e;
}

.integration-description {
  margin: 0;
  color: #586069;
  font-size: 14px;
}

.integration-status {
  flex-shrink: 0;
}

.status-badge {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
}

.status-badge.active {
  background: #d4edda;
  color: #155724;
}

.status-badge.inactive {
  background: #f8f9fa;
  color: #6c757d;
}

.status-badge.disabled {
  background: #f8d7da;
  color: #721c24;
}

.integration-details {
  display: flex;
  gap: 24px;
  margin-bottom: 16px;
  padding: 12px 0;
  border-top: 1px solid #e1e4e8;
  border-bottom: 1px solid #e1e4e8;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-label {
  font-size: 12px;
  color: #586069;
  text-transform: uppercase;
}

.detail-value {
  font-size: 16px;
  font-weight: 600;
  color: #24292e;
}

.detail-value.has-errors {
  color: #dc3545;
}

.integration-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.integration-actions button {
  padding: 6px 16px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: #007bff;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #0056b3;
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover {
  background: #545b62;
}

.btn-danger {
  background: #dc3545;
  color: white;
}

.btn-danger:hover {
  background: #c82333;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.integration-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tag {
  padding: 2px 8px;
  background: #f0f0f0;
  border-radius: 12px;
  font-size: 12px;
  color: #586069;
}
</style>