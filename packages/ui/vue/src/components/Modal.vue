<template>
  <Teleport to="body">
    <Transition name="modal" @enter="onEnter" @leave="onLeave">
      <div 
        v-if="modelValue" 
        class="modal-overlay" 
        @click="handleOverlayClick"
        :style="{ zIndex }"
      >
        <div 
          :class="['modal', sizeClass, { 'modal-centered': centered }]"
          @click.stop
          ref="modalRef"
        >
          <!-- Header -->
          <div v-if="!hideHeader" class="modal-header">
            <slot name="header">
              <h3 class="modal-title">{{ title }}</h3>
            </slot>
            <button 
              v-if="!hideCloseButton"
              @click="close"
              class="modal-close"
              :aria-label="closeAriaLabel"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <!-- Body -->
          <div class="modal-body" :style="bodyStyle">
            <slot />
          </div>

          <!-- Footer -->
          <div v-if="!hideFooter && (hasFooterSlot || showDefaultFooter)" class="modal-footer">
            <slot name="footer">
              <button @click="close" class="btn btn-secondary">
                {{ cancelText }}
              </button>
              <button @click="confirm" class="btn btn-primary">
                {{ confirmText }}
              </button>
            </slot>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { ref, computed, watch, onMounted, onUnmounted, useSlots } from 'vue';

export default {
  name: 'Modal',
  props: {
    modelValue: {
      type: Boolean,
      required: true
    },
    title: {
      type: String,
      default: ''
    },
    size: {
      type: String,
      default: 'medium',
      validator: (value) => ['small', 'medium', 'large', 'xlarge', 'full'].includes(value)
    },
    centered: {
      type: Boolean,
      default: true
    },
    closeOnOverlay: {
      type: Boolean,
      default: true
    },
    closeOnEscape: {
      type: Boolean,
      default: true
    },
    hideHeader: {
      type: Boolean,
      default: false
    },
    hideFooter: {
      type: Boolean,
      default: false
    },
    hideCloseButton: {
      type: Boolean,
      default: false
    },
    showDefaultFooter: {
      type: Boolean,
      default: false
    },
    confirmText: {
      type: String,
      default: 'Confirm'
    },
    cancelText: {
      type: String,
      default: 'Cancel'
    },
    closeAriaLabel: {
      type: String,
      default: 'Close modal'
    },
    bodyStyle: {
      type: Object,
      default: () => ({})
    },
    zIndex: {
      type: Number,
      default: 1000
    },
    trapFocus: {
      type: Boolean,
      default: true
    }
  },
  emits: ['update:modelValue', 'confirm', 'cancel', 'close', 'open'],
  setup(props, { emit }) {
    const modalRef = ref(null);
    const slots = useSlots();
    
    const sizeClass = computed(() => `modal-${props.size}`);
    const hasFooterSlot = computed(() => !!slots.footer);
    
    const close = () => {
      emit('update:modelValue', false);
      emit('close');
    };
    
    const confirm = () => {
      emit('confirm');
      close();
    };
    
    const handleOverlayClick = () => {
      if (props.closeOnOverlay) {
        emit('cancel');
        close();
      }
    };
    
    const handleEscape = (e) => {
      if (e.key === 'Escape' && props.closeOnEscape && props.modelValue) {
        emit('cancel');
        close();
      }
    };
    
    const onEnter = () => {
      document.body.style.overflow = 'hidden';
      emit('open');
      
      if (props.trapFocus) {
        // Focus trap implementation
        setTimeout(() => {
          if (modalRef.value) {
            const focusableElements = modalRef.value.querySelectorAll(
              'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            if (focusableElements.length > 0) {
              focusableElements[0].focus();
            }
          }
        }, 100);
      }
    };
    
    const onLeave = () => {
      document.body.style.overflow = '';
    };
    
    // Keyboard event listener
    watch(() => props.modelValue, (newVal) => {
      if (newVal) {
        document.addEventListener('keydown', handleEscape);
      } else {
        document.removeEventListener('keydown', handleEscape);
      }
    });
    
    onMounted(() => {
      if (props.modelValue) {
        document.addEventListener('keydown', handleEscape);
      }
    });
    
    onUnmounted(() => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    });
    
    return {
      modalRef,
      sizeClass,
      hasFooterSlot,
      close,
      confirm,
      handleOverlayClick,
      onEnter,
      onLeave
    };
  }
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 40px;
  overflow-y: auto;
}

.modal {
  background: white;
  border-radius: 8px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 80px);
  margin: 40px 0;
}

.modal.modal-centered {
  margin: auto 0;
}

/* Size variants */
.modal-small {
  width: 100%;
  max-width: 400px;
}

.modal-medium {
  width: 100%;
  max-width: 600px;
}

.modal-large {
  width: 100%;
  max-width: 800px;
}

.modal-xlarge {
  width: 100%;
  max-width: 1200px;
}

.modal-full {
  width: calc(100vw - 80px);
  max-width: none;
  height: calc(100vh - 80px);
  margin: 0;
}

/* Header */
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px;
  border-bottom: 1px solid #e1e4e8;
}

.modal-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #24292e;
}

.modal-close {
  width: 32px;
  height: 32px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: #586069;
  transition: all 0.2s;
}

.modal-close:hover {
  background: #f0f0f0;
  color: #24292e;
}

.modal-close svg {
  width: 20px;
  height: 20px;
}

/* Body */
.modal-body {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

/* Footer */
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 20px;
  border-top: 1px solid #e1e4e8;
}

/* Buttons */
.btn {
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

/* Transitions */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-active .modal,
.modal-leave-active .modal {
  transition: all 0.3s ease;
}

.modal-enter-from {
  opacity: 0;
}

.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal {
  transform: scale(0.9);
  opacity: 0;
}

.modal-leave-to .modal {
  transform: scale(0.9);
  opacity: 0;
}

/* Responsive */
@media (max-width: 640px) {
  .modal-overlay {
    padding: 20px;
  }
  
  .modal {
    max-height: calc(100vh - 40px);
  }
  
  .modal-full {
    width: calc(100vw - 40px);
    height: calc(100vh - 40px);
  }
}
</style>