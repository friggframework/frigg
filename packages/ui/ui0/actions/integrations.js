export const SET_INTEGRATIONS = 'SET_INTEGRATIONS';

// an action for setting the the integrations into redux
export function setIntegrations(integrations) {
    return {
        type: SET_INTEGRATIONS,
        integrations,
    };
}
