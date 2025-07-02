/**
 * Vue composables for @friggframework/ui-core integration
 */

export { useToast } from './useToast.js';
export { useApiClient } from './useApiClient.js';
export { useAlerts } from './useAlerts.js';
export { useCloudWatch } from './useCloudWatch.js';
export { useFriggCore } from './useFriggCore.js';
export { 
  provideFrigg, 
  injectFrigg, 
  useFriggService,
  useInjectedToast,
  useInjectedApi,
  useInjectedCloudWatch,
  useInjectedAlerts
} from './useFriggProvider.js';