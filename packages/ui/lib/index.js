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
import IntegrationHub from "./integration/IntegrationHub";
import IntegrationTabs from "./integration/IntegrationTabs";
import EntityManager from "./integration/EntityManager";
import IntegrationBuilder from "./integration/IntegrationBuilder";
import UserActionTester from "./integration/UserActionTester";
import AuthModal from "./integration/AuthModal";
import MultiStepAuthWizard from "./integration/MultiStepAuthWizard";
import RecoveryPrompt from "./integration/RecoveryPrompt";
import { FriggProvider, useFrigg, useIntegrationData } from "./integration/context/IntegrationDataContext";

// Hooks
import {
  useEntityTest,
  useModuleAuthorization,
  useMultiStepAuth,
  useCredentials
} from "./integration/hooks";

export {
  // Basic components
  Button,
  Input,
  LoadingSpinner,

  // Core integration components
  IntegrationHorizontal,
  IntegrationVertical,
  IntegrationList,
  RedirectFromAuth,
  UserActionModal,

  // Modern architecture components
  IntegrationHub,
  IntegrationTabs,
  EntityManager,
  IntegrationBuilder,
  UserActionTester,
  AuthModal,

  // Multi-step authentication components
  MultiStepAuthWizard,
  RecoveryPrompt,

  // Context providers and hooks
  FriggProvider,
  useFrigg,
  useIntegrationData,

  // Authentication and entity management hooks
  useEntityTest,
  useModuleAuthorization,
  useMultiStepAuth,
  useCredentials,
};
