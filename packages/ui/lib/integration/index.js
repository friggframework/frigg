// Export the context provider and hook
export { IntegrationDataProvider, useIntegrationData } from './context/IntegrationDataContext';

// Export the custom hook
export { useIntegrationLogic } from './hooks/useIntegrationLogic';

// Export the layout components
export { IntegrationHorizontalLayout } from './layouts/IntegrationHorizontalLayout';
export { IntegrationVerticalLayout } from './layouts/IntegrationVerticalLayout';

// Export the main components
export { default as IntegrationHorizontal } from './IntegrationHorizontal';
export { default as IntegrationVertical } from './IntegrationVertical';
export { default as IntegrationBuilder } from './IntegrationBuilder';
export { default as EntityManager } from './EntityManager';
export { default as IntegrationList } from './IntegrationList';
export { default as RedirectFromAuth } from './RedirectFromAuth';

// Export presentation components
export { EntityCard } from './presentation/components/EntityCard';
export { EntityConnectionModal } from './presentation/components/EntityConnectionModal';
export { EntitySelector } from './presentation/components/EntitySelector';