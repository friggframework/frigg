/**
 * @file IntegrationTabs
 * @description Tab orchestration for integration management
 */

import React, { useState, useEffect } from 'react';
import IntegrationList from './IntegrationList';
import EntityManager from './EntityManager';
import IntegrationBuilder from './IntegrationBuilder';
import UserActionTester from './UserActionTester';

/**
 * IntegrationTabs - Orchestrates navigation between integration views
 *
 * @param {Array<string>} props.enabledTabs - Tabs to show (default: ['gallery', 'accounts', 'builder'])
 * @param {string} props.defaultTab - Default active tab
 * @param {Function} props.onIntegrationCreated - Callback when integration is created
 * @param {boolean} props.showSearch - Show search in gallery
 * @param {boolean} props.showCategoryFilter - Show category filter
 * @param {boolean} props.showViewModeToggle - Show grid/list view toggle (default: true)
 * @param {string} props.defaultComponentLayout - Default layout for integrations (default: 'default-vertical')
 * @param {boolean} props.enableUserActionTester - Enable user action tester tab (dev mode, default: false)
 * @param {Object} props.createdEntity - Entity created from OAuth callback
 * @param {Error} props.oauthError - Error from OAuth callback
 * @param {string} props.oauthModuleType - Module type for OAuth error
 * @returns {JSX.Element}
 */
const IntegrationTabs = ({
  enabledTabs = ['gallery', 'accounts', 'builder'],
  defaultTab = 'gallery',
  onIntegrationCreated,
  showSearch = true,
  showCategoryFilter = true,
  showViewModeToggle = true,
  defaultComponentLayout = 'default-vertical',
  enableUserActionTester = false,
  navigateToSampleDataFn,
  redirectContext = null,
  createdEntity = null,
  oauthError = null,
  oauthModuleType = null,
  wizardState = null,
  onWizardStateChange = null,
  ...props
}) => {
  // Use wizard state from IntegrationHub if provided, otherwise use local state
  const [localActiveTab, setLocalActiveTab] = useState(wizardState?.activeTab || defaultTab);
  const [localBuilderConfig, setLocalBuilderConfig] = useState(wizardState?.builderConfig || null);
  const [localComponentLayout, setLocalComponentLayout] = useState(wizardState?.componentLayout || defaultComponentLayout);

  const activeTab = wizardState ? wizardState.activeTab : localActiveTab;
  const builderConfig = wizardState ? wizardState.builderConfig : localBuilderConfig;
  const componentLayout = wizardState ? wizardState.componentLayout : localComponentLayout;

  const setActiveTab = (tab) => {
    if (onWizardStateChange) {
      onWizardStateChange({ activeTab: tab });
    } else {
      setLocalActiveTab(tab);
    }
  };

  const setBuilderConfig = (config) => {
    if (onWizardStateChange) {
      onWizardStateChange({ builderConfig: config });
    } else {
      setLocalBuilderConfig(config);
    }
  };

  const setComponentLayout = (layout) => {
    if (onWizardStateChange) {
      onWizardStateChange({ componentLayout: layout });
    } else {
      setLocalComponentLayout(layout);
    }
  };

  // Handle OAuth success - open builder with newly created entity
  useEffect(() => {
    if (createdEntity) {
      console.log('🔥 IntegrationTabs - OAuth entity created, opening builder:', createdEntity);
      setBuilderConfig({ preselectedEntity: createdEntity });
      setActiveTab('builder');
    }
  }, [createdEntity]);

  // Handle OAuth error - open builder to show error
  useEffect(() => {
    if (oauthError && oauthModuleType) {
      console.log('🔥 IntegrationTabs - OAuth error, opening builder to show error:', { oauthError, oauthModuleType });
      setBuilderConfig({
        preselectedIntegrationType: { type: oauthModuleType },
        oauthError: oauthError
      });
      setActiveTab('builder');
    }
  }, [oauthError, oauthModuleType]);

  const handleInstallClick = (integration) => {
    // When installing from gallery, pass as preselectedIntegrationType
    setBuilderConfig({ preselectedIntegrationType: integration });
    setActiveTab('builder');
  };

  const handleBuildIntegration = (entity) => {
    // When building from entity, pass as preselectedEntity
    setBuilderConfig({ preselectedEntity: entity });
    setActiveTab('builder');
  };

  const handleIntegrationComplete = (integration) => {
    onIntegrationCreated?.(integration);
    setActiveTab('gallery');
    setBuilderConfig(null);
  };

  const handleCancel = () => {
    setActiveTab('gallery');
    setBuilderConfig(null);
  };

  // Tab configuration - builder tab is hidden from nav, only activated programmatically
  const tabs = [
    {
      id: 'gallery',
      label: 'Integration Gallery',
      icon: '🔌',
      enabled: enabledTabs.includes('gallery'),
      visibleInNav: true
    },
    {
      id: 'accounts',
      label: 'Connected Accounts',
      icon: '🔗',
      enabled: enabledTabs.includes('accounts'),
      visibleInNav: true
    },
    {
      id: 'builder',
      label: 'Integration Builder',
      icon: '⚙️',
      enabled: enabledTabs.includes('builder'),
      visibleInNav: false  // Hidden from tab bar, activated via install button
    },
    {
      id: 'user-actions',
      label: 'Test User Actions',
      icon: '🧪',
      enabled: enableUserActionTester,
      visibleInNav: true
    }
  ].filter(tab => tab.enabled);

  const visibleTabs = tabs.filter(tab => tab.visibleInNav);

  return (
    <div className="integration-tabs-container">
      {/* Tab Navigation */}
      {visibleTabs.length > 1 && (
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            {visibleTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                  ${activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      )}

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'gallery' && (
          <div>
            <div className="mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Integration Gallery</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    Browse and install integrations for your application
                  </p>
                </div>

                {/* View Mode Toggle */}
                {showViewModeToggle && (
                  <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => setComponentLayout('default-vertical')}
                      className={`p-2 rounded transition-colors ${componentLayout === 'default-vertical'
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                        }`}
                      title="Grid view"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <rect x="3" y="3" width="7" height="7" strokeWidth="2" />
                        <rect x="14" y="3" width="7" height="7" strokeWidth="2" />
                        <rect x="3" y="14" width="7" height="7" strokeWidth="2" />
                        <rect x="14" y="14" width="7" height="7" strokeWidth="2" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setComponentLayout('default-horizontal')}
                      className={`p-2 rounded transition-colors ${componentLayout === 'default-horizontal'
                          ? 'bg-white text-blue-600 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                        }`}
                      title="List view"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <line x1="3" y1="6" x2="21" y2="6" strokeWidth="2" />
                        <line x1="3" y1="12" x2="21" y2="12" strokeWidth="2" />
                        <line x1="3" y1="18" x2="21" y2="18" strokeWidth="2" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
            <IntegrationList
              showSearch={showSearch}
              showCategoryFilter={showCategoryFilter}
              componentLayout={componentLayout}
              navigateToSampleDataFn={navigateToSampleDataFn}
              onInstallClick={handleInstallClick}
              redirectContext={redirectContext}
            />
          </div>
        )}

        {activeTab === 'accounts' && (
          <EntityManager
            onBuildIntegration={handleBuildIntegration}
            onConnectNewEntity={(moduleType) => {
              // TODO: Implement OAuth flow navigation
              alert(`OAuth flow for ${moduleType || 'new module'} not yet implemented. This would redirect to authorization URL.`);
            }}
            redirectContext={redirectContext}
            {...props}
          />
        )}

        {activeTab === 'builder' && (
          <IntegrationBuilder
            preselectedEntity={builderConfig?.preselectedEntity}
            preselectedIntegrationType={builderConfig?.preselectedIntegrationType}
            oauthError={builderConfig?.oauthError}
            onIntegrationCreated={handleIntegrationComplete}
            onCancel={handleCancel}
            redirectContext={redirectContext}
            {...props}
          />
        )}

        {activeTab === 'user-actions' && enableUserActionTester && (
          <UserActionTester {...props} />
        )}
      </div>
    </div>
  );
};

export default IntegrationTabs;
