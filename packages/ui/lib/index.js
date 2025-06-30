import "./index.css";
import { Button } from "./components/button.jsx";
import { Input } from "./components/input.jsx";
import { LoadingSpinner } from "./components/LoadingSpinner.jsx";
import {
  IntegrationHorizontal,
  IntegrationVertical,
  IntegrationList,
  RedirectFromAuth,
  UserActionModal,
} from "./integration";

// Export React components
export {
  Button,
  Input,
  LoadingSpinner,
  IntegrationHorizontal,
  IntegrationVertical,
  IntegrationList,
  RedirectFromAuth,
  UserActionModal,
};

// Export React hooks
export { useToast } from "./hooks/useToast.js";

// Re-export ui-core functionality for React users
export {
  // Core classes
  FriggUICore,
  createFriggUICore,
  friggUICore,
  
  // API clients
  ApiClient,
  MonitoringApiService,
  
  // State management
  ToastManager,
  toastManager,
  toast,
  
  // Utilities
  mergeClassNames,
  cn,
  debounce,
  throttle,
  deepClone,
  generateId,
  parseTimeRange,
  formatRelativeTime,
  
  // Integration utilities
  getActiveAndPossibleIntegrationsCombined,
  isIntegrationConnected,
  filterIntegrationsByStatus,
  groupIntegrationsByType,
  
  // Services
  CloudWatchService,
  AlertsService,
  
  // Models
  DummyUser,
  DummyUserManager,
  dummyUserManager,
  
  // Plugin system
  FrameworkPlugin,
  PluginManager,
  FrameworkAdapter,
  HOOKS,
  COMPONENTS,
  ADAPTERS
} from "@friggframework/ui-core";
