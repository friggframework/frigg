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
