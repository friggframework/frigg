<template>
  <div :class="['loading-spinner-container', { 'full-screen': fullScreen }]">
    <div :class="['loading-spinner', sizeClass, variantClass]">
      <div class="spinner" :style="spinnerStyle">
        <svg viewBox="0 0 50 50">
          <circle
            class="path"
            cx="25"
            cy="25"
            r="20"
            fill="none"
            :stroke-width="strokeWidth"
          />
        </svg>
      </div>
      <p v-if="message" class="loading-message">{{ message }}</p>
    </div>
  </div>
</template>

<script>
import { computed } from 'vue';

export default {
  name: 'LoadingSpinner',
  props: {
    size: {
      type: String,
      default: 'medium',
      validator: (value) => ['small', 'medium', 'large', 'xlarge'].includes(value)
    },
    color: {
      type: String,
      default: null
    },
    message: {
      type: String,
      default: null
    },
    fullScreen: {
      type: Boolean,
      default: false
    },
    variant: {
      type: String,
      default: 'primary',
      validator: (value) => ['primary', 'secondary', 'success', 'danger', 'warning', 'info'].includes(value)
    },
    strokeWidth: {
      type: Number,
      default: 3
    }
  },
  setup(props) {
    const sizeClass = computed(() => `size-${props.size}`);
    const variantClass = computed(() => `variant-${props.variant}`);
    
    const spinnerStyle = computed(() => {
      if (props.color) {
        return { '--spinner-color': props.color };
      }
      return {};
    });

    return {
      sizeClass,
      variantClass,
      spinnerStyle
    };
  }
};
</script>

<style scoped>
.loading-spinner-container {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.loading-spinner-container.full-screen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.9);
  z-index: 9999;
}

.loading-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

/* Size variants */
.loading-spinner.size-small .spinner {
  width: 24px;
  height: 24px;
}

.loading-spinner.size-medium .spinner {
  width: 40px;
  height: 40px;
}

.loading-spinner.size-large .spinner {
  width: 60px;
  height: 60px;
}

.loading-spinner.size-xlarge .spinner {
  width: 80px;
  height: 80px;
}

/* Color variants */
.loading-spinner.variant-primary {
  --spinner-color: #007bff;
}

.loading-spinner.variant-secondary {
  --spinner-color: #6c757d;
}

.loading-spinner.variant-success {
  --spinner-color: #28a745;
}

.loading-spinner.variant-danger {
  --spinner-color: #dc3545;
}

.loading-spinner.variant-warning {
  --spinner-color: #ffc107;
}

.loading-spinner.variant-info {
  --spinner-color: #17a2b8;
}

.spinner {
  animation: rotate 2s linear infinite;
}

.spinner svg {
  width: 100%;
  height: 100%;
}

.path {
  stroke: var(--spinner-color, #007bff);
  stroke-linecap: round;
  animation: dash 1.5s ease-in-out infinite;
}

.loading-message {
  margin: 0;
  color: #586069;
  font-size: 14px;
  text-align: center;
}

.loading-spinner.size-small .loading-message {
  font-size: 12px;
}

.loading-spinner.size-large .loading-message {
  font-size: 16px;
}

.loading-spinner.size-xlarge .loading-message {
  font-size: 18px;
}

@keyframes rotate {
  100% {
    transform: rotate(360deg);
  }
}

@keyframes dash {
  0% {
    stroke-dasharray: 1, 150;
    stroke-dashoffset: 0;
  }
  50% {
    stroke-dasharray: 90, 150;
    stroke-dashoffset: -35;
  }
  100% {
    stroke-dasharray: 90, 150;
    stroke-dashoffset: -124;
  }
}
</style>