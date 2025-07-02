<template>
  <div class="toast-demo">
    <h3>Toast Notifications Demo</h3>
    
    <div class="button-group">
      <button @click="showSuccess">Show Success</button>
      <button @click="showError">Show Error</button>
      <button @click="showWarning">Show Warning</button>
      <button @click="showInfo">Show Info</button>
      <button @click="dismissAll" v-if="toasts.length > 0">Dismiss All</button>
    </div>

    <div class="toast-container" v-if="toasts.length > 0">
      <div 
        v-for="toast in toasts" 
        :key="toast.id"
        :class="['toast', `toast-${toast.variant || 'default'}`]"
      >
        <div class="toast-header">
          <strong>{{ toast.title }}</strong>
          <button @click="dismiss(toast.id)" class="toast-close">×</button>
        </div>
        <div class="toast-body" v-if="toast.description">
          {{ toast.description }}
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { useToast } from '../composables/useToast.js';

export default {
  name: 'ToastDemo',
  setup() {
    const { toasts, success, error, warning, info, dismiss, dismissAll } = useToast();

    const showSuccess = () => {
      success('Operation completed successfully!');
    };

    const showError = () => {
      error('Something went wrong. Please try again.');
    };

    const showWarning = () => {
      warning('This action cannot be undone.');
    };

    const showInfo = () => {
      info('Here is some helpful information.');
    };

    return {
      toasts,
      showSuccess,
      showError,
      showWarning,
      showInfo,
      dismiss,
      dismissAll
    };
  }
};
</script>

<style scoped>
.toast-demo {
  padding: 20px;
  max-width: 600px;
  margin: 0 auto;
}

.button-group {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

button {
  padding: 8px 16px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #f8f9fa;
  cursor: pointer;
  transition: background-color 0.2s;
}

button:hover {
  background: #e9ecef;
}

.toast-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.toast {
  min-width: 300px;
  max-width: 400px;
  padding: 12px 16px;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  background: white;
  border-left: 4px solid #007bff;
}

.toast-success {
  border-left-color: #28a745;
}

.toast-destructive {
  border-left-color: #dc3545;
}

.toast-warning {
  border-left-color: #ffc107;
}

.toast-default {
  border-left-color: #007bff;
}

.toast-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.toast-close {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  padding: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toast-body {
  color: #6c757d;
  font-size: 14px;
}
</style>