// React wrapper for ui-core toast functionality
import { useToast } from '../hooks/useToast.js';
import { toast, toastReducer as reducer, toastActionTypes as actionTypes } from '@friggframework/ui-core';

// Re-export for backward compatibility
export { useToast, toast, reducer, actionTypes };
