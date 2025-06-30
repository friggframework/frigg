/**
 * Svelte store for toast notifications using ui-core ToastManager
 */

import { writable, derived } from 'svelte/store';
import { friggUICore } from '@friggframework/ui-core';

// Create the toast store
function createToastStore() {
  const toastManager = friggUICore.getToastManager();
  
  // Create a writable store for toasts
  const { subscribe, set } = writable(toastManager.getState().toasts);
  
  // Keep track of the subscription
  let unsubscribe = null;
  
  // Subscribe to toast manager updates
  const startSubscription = () => {
    if (!unsubscribe) {
      unsubscribe = toastManager.subscribe((state) => {
        set(state.toasts);
      });
    }
  };
  
  // Stop subscription
  const stopSubscription = () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };
  
  // Start subscription when first subscriber connects
  const customSubscribe = (run, invalidate) => {
    const unsubscriber = subscribe(run, invalidate);
    
    // Start subscription on first subscriber
    startSubscription();
    
    // Return cleanup function
    return () => {
      unsubscriber();
      // Note: We don't stop the subscription here to handle multiple subscribers
    };
  };
  
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
  
  // Clean up subscription when no longer needed
  const destroy = () => {
    stopSubscription();
  };
  
  return {
    subscribe: customSubscribe,
    toast,
    success,
    error,
    warning,
    info,
    dismiss,
    dismissAll,
    clear,
    destroy
  };
}

// Export the toast store instance
export const toastStore = createToastStore();

// Export individual methods for convenience
export const { toast, success, error, warning, info, dismiss, dismissAll, clear } = toastStore;

// Create derived store for toast count
export const toastCount = derived(toastStore, $toasts => $toasts.length);

// Create derived store for active toasts (not dismissed)
export const activeToasts = derived(toastStore, $toasts => 
  $toasts.filter(toast => !toast.dismissed)
);