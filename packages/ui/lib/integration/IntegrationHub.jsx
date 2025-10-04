/**
 * @file IntegrationHub
 * @description Complete drop-in integration management component
 * Encapsulates all integration UX: gallery, accounts, builder, wizard
 */

import React, { useEffect, useState } from 'react';
import { FriggProvider } from './context/IntegrationDataContext';
import IntegrationTabs from './IntegrationTabs';
import API from '../api/api.js';

/**
 * IntegrationHub - Complete integration management in one component
 *
 * @param {string} props.friggBaseUrl - Base URL of Frigg API
 * @param {string} props.authToken - JWT authentication token
 * @param {Function} props.onIntegrationCreated - Callback when integration is created
 * @param {Function} props.onError - Error handler callback
 * @param {Function} props.onOAuthComplete - Callback when OAuth flow completes (entity, moduleType) => void
 * @param {Array<string>} props.enabledTabs - Tabs to show (default: ['gallery', 'accounts', 'builder'])
 * @param {string} props.defaultTab - Default active tab (default: 'gallery')
 * @param {boolean} props.showSearch - Show search in gallery (default: true)
 * @param {boolean} props.showCategoryFilter - Show category filter (default: true)
 * @param {boolean} props.showViewModeToggle - Show grid/list view toggle (default: true)
 * @param {string} props.defaultComponentLayout - Default layout for integrations (default: 'default-vertical')
 * @param {boolean} props.enableUserActionTester - Enable user action tester tab for dev mode (default: false)
 * @param {Object} props.redirectContext - Context for OAuth2 redirects
 * @param {Function} [props.redirectContext.onOAuthRedirect] - Called before OAuth redirect for state preservation
 * @param {string} [props.redirectContext.source] - Source UI ('management-ui' | 'frigg-ui-library')
 * @param {string} [props.redirectContext.returnUrl] - URL to return to after auth
 * @returns {JSX.Element}
 */
const IntegrationHub = ({
  friggBaseUrl,
  authToken,
  onIntegrationCreated,
  onError,
  onOAuthComplete,
  enabledTabs = ['gallery', 'accounts', 'builder'],
  defaultTab = 'gallery',
  showSearch = true,
  showCategoryFilter = true,
  showViewModeToggle = true,
  defaultComponentLayout = 'default-vertical',
  enableUserActionTester = false,
  redirectContext = null,
  ...props
}) => {
  // Wizard state tracking - restore from localStorage
  const getInitialWizardState = () => {
    try {
      const saved = localStorage.getItem('frigg-wizard-state');
      if (saved) {
        const state = JSON.parse(saved);
        const stateAge = Date.now() - new Date(state.timestamp).getTime();

        // Restore if less than 1 hour old
        if (stateAge < 3600000) {
          return {
            activeTab: state.activeTab || defaultTab,
            builderConfig: state.builderConfig || null,
            componentLayout: state.componentLayout || defaultComponentLayout
          };
        }
      }
    } catch (err) {
      // Error restoring state - will use defaults
    }

    return {
      activeTab: defaultTab,
      builderConfig: null,
      componentLayout: defaultComponentLayout
    };
  };

  const initialWizardState = getInitialWizardState();

  const [oauthProcessing, setOauthProcessing] = useState(false);
  const [createdEntity, setCreatedEntity] = useState(null);
  const [oauthError, setOauthError] = useState(null);
  const [oauthModuleType, setOauthModuleType] = useState(null);
  const [wizardState, setWizardState] = useState(initialWizardState);

  if (!friggBaseUrl) {
    return (
      <div className="p-8 text-center text-red-600">
        <p>Error: friggBaseUrl is required</p>
      </div>
    );
  }

  if (!authToken) {
    return (
      <div className="p-8 text-center text-red-600">
        <p>Error: authToken is required</p>
      </div>
    );
  }

  // Handle OAuth callback on mount
  useEffect(() => {
    const handleOAuthCallback = async () => {
      try {
        const params = new URLSearchParams(window.location.search);

        const code = params.get('code');
        const state = params.get('state');
        const success = params.get('success');
        const error = params.get('error');

        // Handle error from backend
        if (error) {
          const moduleType = localStorage.getItem('oauth_module_type');
          localStorage.removeItem('oauth_module_type');

          setOauthError(new Error(error));
          setOauthModuleType(moduleType);
          onError?.(new Error(`OAuth failed: ${error}`));
          return;
        }

        // NEW FLOW: Backend already processed OAuth, just notify success
        if (success === 'true' && !code && !state) {
          const moduleType = localStorage.getItem('oauth_module_type');
          localStorage.removeItem('oauth_module_type');

          // Clear URL parameters
          const url = new URL(window.location);
          url.searchParams.delete('success');
          window.history.replaceState({}, '', url);

          // Notify platform that OAuth completed (entity already created by backend)
          // Parent component should handle refreshing entities
          if (onOAuthComplete && moduleType) {
            onOAuthComplete(null, moduleType); // Entity will be fetched by parent on refresh
          }

          return;
        }

        // OLD FLOW: Frontend receives code/state and must complete OAuth
        if (!code || !state) {
          return; // Not an OAuth callback
        }

        setOauthProcessing(true);

        // Retrieve module type from localStorage
        const moduleType = localStorage.getItem('oauth_module_type');
        if (!moduleType) {
          throw new Error('OAuth module type not found in localStorage');
        }

        // Complete OAuth flow via API
        const api = new API(friggBaseUrl, authToken);
        const result = await api.submitModuleAuthorization(moduleType, { code, state });

        // Clean up OAuth state
        localStorage.removeItem('oauth_module_type');

        // Store created entity for IntegrationTabs to use
        if (result.entity) {
          setCreatedEntity(result.entity);

          // Notify platform that OAuth completed
          if (onOAuthComplete) {
            onOAuthComplete(result.entity, moduleType);
          }
        }

      } catch (err) {

        // Store error and module type to show in wizard
        setOauthError(err);
        const moduleType = localStorage.getItem('oauth_module_type');
        setOauthModuleType(moduleType);
        localStorage.removeItem('oauth_module_type');

        onError?.(err);
      } finally {
        setOauthProcessing(false);
      }
    };

    handleOAuthCallback();
  }, [friggBaseUrl, authToken, onOAuthComplete, onError]);

  // Save wizard state to localStorage whenever it changes
  useEffect(() => {
    if (wizardState.activeTab || wizardState.builderConfig) {
      const stateToSave = {
        ...wizardState,
        timestamp: new Date().toISOString()
      };
      localStorage.setItem('frigg-wizard-state', JSON.stringify(stateToSave));
    }
  }, [wizardState]);

  // Callback for IntegrationTabs to update wizard state
  const handleWizardStateChange = (updates) => {
    setWizardState(prev => ({
      ...prev,
      ...updates
    }));
  };

  if (oauthProcessing) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Completing OAuth authorization...</p>
        </div>
      </div>
    );
  }

  return (
    <FriggProvider
      friggBaseUrl={friggBaseUrl}
      authToken={authToken}
      redirectContext={redirectContext}
      onError={onError}
    >
      <IntegrationTabs
        enabledTabs={enabledTabs}
        defaultTab={defaultTab}
        showSearch={showSearch}
        showCategoryFilter={showCategoryFilter}
        showViewModeToggle={showViewModeToggle}
        defaultComponentLayout={defaultComponentLayout}
        enableUserActionTester={enableUserActionTester}
        onIntegrationCreated={onIntegrationCreated}
        redirectContext={redirectContext}
        createdEntity={createdEntity}
        oauthError={oauthError}
        oauthModuleType={oauthModuleType}
        wizardState={wizardState}
        onWizardStateChange={handleWizardStateChange}
        {...props}
      />
    </FriggProvider>
  );
};

export default IntegrationHub;
