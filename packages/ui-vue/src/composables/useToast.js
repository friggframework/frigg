/**
 * Vue composable for toast notifications using ui-core ToastManager
 */

import { ref, onMounted, onUnmounted } from 'vue';
import { friggUICore } from '@friggframework/ui-core';

export function useToast() {
  const toasts = ref([]);
  let unsubscribe = null;

  const toastManager = friggUICore.getToastManager();

  // Subscribe to toast state changes
  onMounted(() => {
    // Initialize with current state
    toasts.value = toastManager.getState().toasts;

    // Subscribe to updates
    unsubscribe = toastManager.subscribe((state) => {
      toasts.value = state.toasts;
    });
  });

  // Cleanup subscription
  onUnmounted(() => {
    if (unsubscribe) {
      unsubscribe();
    }
  });

  // Toast creation functions
  const toast = (props) => {
    return toastManager.toast(props);
  };

  const success = (message, options = {}) => {
    return toast({
      title: 'Success',
      description: message,
      variant: 'success',
      ...options
    });
  };

  const error = (message, options = {}) => {
    return toast({
      title: 'Error',
      description: message,
      variant: 'destructive',
      ...options
    });
  };

  const warning = (message, options = {}) => {
    return toast({
      title: 'Warning',
      description: message,
      variant: 'warning',
      ...options
    });
  };

  const info = (message, options = {}) => {
    return toast({
      title: 'Info',
      description: message,
      variant: 'default',
      ...options
    });
  };

  const dismiss = (toastId) => {
    toastManager.dismiss(toastId);
  };

  const dismissAll = () => {
    toastManager.dismissAll();
  };

  const clear = () => {
    toastManager.clear();
  };

  return {
    toasts,
    toast,
    success,
    error,
    warning,
    info,
    dismiss,
    dismissAll,
    clear
  };
}