import { useState, useEffect } from 'react';
import { toastManager } from '@friggframework/ui-core';

/**
 * React hook for using the framework-agnostic toast manager
 * Bridges ui-core toast functionality with React components
 */
export function useToast() {
  const [state, setState] = useState(toastManager.getState());

  useEffect(() => {
    const unsubscribe = toastManager.subscribe(setState);
    return unsubscribe;
  }, []);

  return {
    ...state,
    toast: toastManager.toast.bind(toastManager),
    dismiss: toastManager.dismiss.bind(toastManager),
    dismissAll: toastManager.dismissAll.bind(toastManager),
    clear: toastManager.clear.bind(toastManager)
  };
}