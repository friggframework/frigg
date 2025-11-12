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
import { FriggProvider, useFrigg, useIntegrationData } from "./integration/context/IntegrationDataContext";

export {
  Button,
  Input,
  LoadingSpinner,
  IntegrationHorizontal,
  IntegrationVertical,
  IntegrationList,
  RedirectFromAuth,
  UserActionModal,
  // New architecture components
  IntegrationHub,
  IntegrationTabs,
  EntityManager,
  IntegrationBuilder,
  UserActionTester,
  AuthModal,
  // Context providers and hooks
  FriggProvider,
  useFrigg,
  useIntegrationData,
};
