/**
 * Intentionally invalid API module for frigg validate --module fail tests.
 */
class BadApi {}

module.exports = {
    Api: BadApi,
    Definition: {
        // missing moduleName, getName; unknown top-level key; auth methods incomplete
        API: BadApi,
        modelName: 'Bad',
        notARealField: true,
        requiredAuthMethods: {
            // missing getEntityDetails, getCredentialDetails, testAuthRequest, apiPropertiesToPersist
            getAuthorizationRequirements: () => ({ type: 'apiKey' }),
        },
    },
};
