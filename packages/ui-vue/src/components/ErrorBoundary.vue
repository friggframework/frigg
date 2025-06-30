<template>
  <div v-if="hasError" :class="['error-boundary', variantClass]">
    <div class="error-content">
      <div class="error-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      
      <h3 class="error-title">{{ title || 'Something went wrong' }}</h3>
      
      <p v-if="message || error" class="error-message">
        {{ message || error.message || 'An unexpected error occurred' }}
      </p>
      
      <div v-if="showDetails && error" class="error-details">
        <details>
          <summary>Error Details</summary>
          <pre>{{ errorDetails }}</pre>
        </details>
      </div>
      
      <div class="error-actions">
        <button @click="retry" class="btn-primary">
          {{ retryText || 'Try Again' }}
        </button>
        <button v-if="onReset" @click="reset" class="btn-secondary">
          Reset
        </button>
      </div>
    </div>
  </div>
  <slot v-else />
</template>

<script>
import { ref, computed, onErrorCaptured, watch } from 'vue';

export default {
  name: 'ErrorBoundary',
  props: {
    fallback: {
      type: [String, Object],
      default: null
    },
    onError: {
      type: Function,
      default: null
    },
    onReset: {
      type: Function,
      default: null
    },
    showDetails: {
      type: Boolean,
      default: process.env.NODE_ENV === 'development'
    },
    variant: {
      type: String,
      default: 'default',
      validator: (value) => ['default', 'minimal', 'full'].includes(value)
    },
    title: {
      type: String,
      default: null
    },
    message: {
      type: String,
      default: null
    },
    retryText: {
      type: String,
      default: null
    },
    captureErrors: {
      type: Boolean,
      default: true
    }
  },
  emits: ['error', 'retry', 'reset'],
  setup(props, { emit, slots }) {
    const hasError = ref(false);
    const error = ref(null);
    const errorInfo = ref(null);
    
    const variantClass = computed(() => `variant-${props.variant}`);
    
    const errorDetails = computed(() => {
      if (!error.value) return '';
      
      const details = {
        message: error.value.message,
        stack: error.value.stack,
        ...errorInfo.value
      };
      
      return JSON.stringify(details, null, 2);
    });
    
    // Error capturing
    if (props.captureErrors) {
      onErrorCaptured((err, instance, info) => {
        hasError.value = true;
        error.value = err;
        errorInfo.value = {
          componentName: instance?.$options.name || 'Unknown',
          errorInfo: info
        };
        
        // Call error handler
        if (props.onError) {
          props.onError(err, instance, info);
        }
        
        // Emit error event
        emit('error', { error: err, instance, info });
        
        // Prevent error propagation
        return false;
      });
    }
    
    // Retry functionality
    const retry = () => {
      hasError.value = false;
      error.value = null;
      errorInfo.value = null;
      emit('retry');
    };
    
    // Reset functionality
    const reset = () => {
      hasError.value = false;
      error.value = null;
      errorInfo.value = null;
      
      if (props.onReset) {
        props.onReset();
      }
      
      emit('reset');
    };
    
    // Watch for external error prop changes
    watch(() => props.fallback, (newFallback) => {
      if (newFallback) {
        hasError.value = true;
        if (typeof newFallback === 'object' && newFallback.message) {
          error.value = newFallback;
        }
      }
    }, { immediate: true });
    
    return {
      hasError,
      error,
      errorInfo,
      variantClass,
      errorDetails,
      retry,
      reset
    };
  }
};
</script>

<style scoped>
.error-boundary {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  padding: 40px;
}

.error-boundary.variant-minimal {
  min-height: 100px;
  padding: 20px;
}

.error-boundary.variant-full {
  min-height: 400px;
}

.error-content {
  text-align: center;
  max-width: 500px;
}

.error-icon {
  width: 64px;
  height: 64px;
  margin: 0 auto 20px;
  color: #dc3545;
}

.error-boundary.variant-minimal .error-icon {
  width: 32px;
  height: 32px;
  margin-bottom: 12px;
}

.error-icon svg {
  width: 100%;
  height: 100%;
}

.error-title {
  margin: 0 0 12px 0;
  font-size: 24px;
  color: #24292e;
}

.error-boundary.variant-minimal .error-title {
  font-size: 18px;
}

.error-message {
  margin: 0 0 20px 0;
  color: #586069;
  font-size: 16px;
  line-height: 1.5;
}

.error-boundary.variant-minimal .error-message {
  font-size: 14px;
  margin-bottom: 16px;
}

.error-details {
  margin: 20px 0;
  text-align: left;
}

.error-details details {
  background: #f6f8fa;
  border: 1px solid #e1e4e8;
  border-radius: 6px;
  padding: 12px;
}

.error-details summary {
  cursor: pointer;
  font-weight: 600;
  color: #24292e;
  user-select: none;
}

.error-details pre {
  margin: 12px 0 0 0;
  padding: 12px;
  background: #ffffff;
  border: 1px solid #e1e4e8;
  border-radius: 4px;
  font-size: 12px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.error-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.error-boundary.variant-minimal .error-actions {
  gap: 8px;
}

.error-actions button {
  padding: 8px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background: #007bff;
  color: white;
}

.btn-primary:hover {
  background: #0056b3;
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover {
  background: #545b62;
}
</style>