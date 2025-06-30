/**
 * Framework-agnostic integration utilities
 * Extracted from @friggframework/ui for multi-framework support
 */

export const getActiveAndPossibleIntegrationsCombined = (integrationsData) => {
  const combinedIntegrations = [];
  const activeIntegrations = getActiveIntegrations(integrationsData);
  const possibleIntegrations = getPossibleIntegrations(integrationsData);

  possibleIntegrations.forEach((integration) => {
    const foundActive = activeIntegrations.filter(
      (ai) => ai.type === integration.type
    );
    if (foundActive.length > 0) {
      foundActive.forEach((ai) => {
        combinedIntegrations.push(ai);
      });
    } else {
      combinedIntegrations.push(integration);
    }
  });

  return combinedIntegrations;
};

// return a list of objects containing data related to the active/existing user integrations
const getActiveIntegrations = (integrationsData) => {
  const activeIntegrations = [];
  integrationsData.integrations.forEach((integration) => {
    const clone = { ...integration };
    const secondaryId = clone.entities[1].id; // get 2nd element
    const type = getTypeForId(secondaryId, integrationsData);
    clone.type = type;
    clone.display = getDisplayDataForType(type, integrationsData);
    // clone.connected = true;
    // clone['secondaryId'] = secondaryId;
    activeIntegrations.push(clone);
  });

  return activeIntegrations;
};

const getTypeForId = (entityId, integrationsData) => {
  const authorizedEntities = integrationsData.entities.authorized;
  const entity = authorizedEntities.find((ae) => ae.id === entityId);

  if (entity) {
    return entity.type;
  }

  throw Error(
    `getTypeForId() ERR - entityId ${entityId} does not exist in authorized entities!`
  );
};

const getDisplayDataForType = (type, integrationsData) => {
  const possibleIntegrations = getPossibleIntegrations(integrationsData);
  const integration = possibleIntegrations.find((pi) => pi.type === type);

  if (integration) {
    return integration.display;
  }

  throw Error(
    `getDisplayForType() ERR - type ${type} does not exist in possible integrations!`
  );
};

// return a list of objects containing data related to the possible
// new integrations you may connect
const getPossibleIntegrations = (integrationsData) => {
  const options = integrationsData.entities.options;
  return options;

  // exclude the primary
  const possibleOptions = [];
  options.forEach((opt) => {
    if (opt.type !== integrationsData.entities.primary) {
      // opt.connected = false;
      possibleOptions.push(opt);
    }
  });
  return possibleOptions;
};

/**
 * Additional utility functions for integration management
 */

/**
 * Check if an integration is connected
 * @param {Object} integration - Integration object
 * @returns {boolean} - True if connected
 */
export const isIntegrationConnected = (integration) => {
  return integration && integration.status === 'connected';
};

/**
 * Get integration status display text
 * @param {Object} integration - Integration object
 * @returns {string} - Status display text
 */
export const getIntegrationStatusText = (integration) => {
  if (!integration) return 'Unknown';
  
  switch (integration.status) {
    case 'connected':
      return 'Connected';
    case 'disconnected':
      return 'Disconnected';
    case 'error':
      return 'Error';
    case 'pending':
      return 'Pending';
    default:
      return 'Unknown';
  }
};

/**
 * Filter integrations by status
 * @param {Array} integrations - Array of integrations
 * @param {string} status - Status to filter by
 * @returns {Array} - Filtered integrations
 */
export const filterIntegrationsByStatus = (integrations, status) => {
  return integrations.filter(integration => integration.status === status);
};

/**
 * Group integrations by type
 * @param {Array} integrations - Array of integrations
 * @returns {Object} - Grouped integrations by type
 */
export const groupIntegrationsByType = (integrations) => {
  return integrations.reduce((groups, integration) => {
    const type = integration.type;
    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push(integration);
    return groups;
  }, {});
};

/**
 * Sort integrations by display name
 * @param {Array} integrations - Array of integrations
 * @returns {Array} - Sorted integrations
 */
export const sortIntegrationsByName = (integrations) => {
  return [...integrations].sort((a, b) => {
    const nameA = a.display?.name || a.name || '';
    const nameB = b.display?.name || b.name || '';
    return nameA.localeCompare(nameB);
  });
};

export {
  getActiveIntegrations,
  getPossibleIntegrations,
  getTypeForId,
  getDisplayDataForType
};