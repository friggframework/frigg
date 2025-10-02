/**
 * @file IntegrationHub
 * @description Complete drop-in integration management component
 * Encapsulates all integration UX: gallery, accounts, builder, wizard
 */

import React from 'react';
import { FriggProvider } from './context/IntegrationDataContext';
import IntegrationTabs from './IntegrationTabs';

/**
 * IntegrationHub - Complete integration management in one component
 *
 * @param {string} props.friggBaseUrl - Base URL of Frigg API
 * @param {string} props.authToken - JWT authentication token
 * @param {Function} props.onIntegrationCreated - Callback when integration is created
 * @param {Function} props.onError - Error handler callback
 * @param {Array<string>} props.enabledTabs - Tabs to show (default: ['gallery', 'accounts', 'builder'])
 * @param {string} props.defaultTab - Default active tab (default: 'gallery')
 * @param {boolean} props.showSearch - Show search in gallery (default: true)
 * @param {boolean} props.showCategoryFilter - Show category filter (default: true)
 * @param {boolean} props.showViewModeToggle - Show grid/list view toggle (default: true)
 * @param {string} props.defaultComponentLayout - Default layout for integrations (default: 'default-vertical')
 * @param {boolean} props.enableUserActionTester - Enable user action tester tab for dev mode (default: false)
 * @returns {JSX.Element}
 */
const IntegrationHub = ({
  friggBaseUrl,
  authToken,
  onIntegrationCreated,
  onError,
  enabledTabs = ['gallery', 'accounts', 'builder'],
  defaultTab = 'gallery',
  showSearch = true,
  showCategoryFilter = true,
  showViewModeToggle = true,
  defaultComponentLayout = 'default-vertical',
  enableUserActionTester = false,
  ...props
}) => {
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

  return (
    <FriggProvider
      friggBaseUrl={friggBaseUrl}
      authToken={authToken}
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
        {...props}
      />
    </FriggProvider>
  );
};

export default IntegrationHub;
