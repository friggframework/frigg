const {flushDebugLog} = require('@friggframework/core');

async function testDefinitionRequiredAuthMethods(api, definition, authCallbackParams, tokenResponse, userId) {

    // const response = await definition.getToken(api, authCallbackParams);
    // expect(api.setTokens).toHaveBeenCalled();
    // if (tokenResponse) {
    //     expect(response).toMatchObject(tokenResponse);
    // }

    const entityDetails = await definition.requiredAuthMethods.getEntityDetails(api, authCallbackParams, tokenResponse, userId);
    expect(entityDetails).toHaveProperty('identifiers');
    expect(Object.values(entityDetails.identifiers).length).toBeGreaterThan(0);
    for (const key of Object.keys(entityDetails.identifiers)){
        expect(key).toBeDefined();
        expect(entityDetails.identifiers[key]).toBeDefined();
    }


    const credentialDetails = await definition.requiredAuthMethods.getCredentialDetails(api);
    expect(credentialDetails).toHaveProperty('identifiers');
    expect(Object.values(entityDetails.identifiers).length).toBeGreaterThan(0);
    for (const key of Object.keys(entityDetails.identifiers)){
        expect(key).toBeDefined();
        expect(entityDetails.identifiers[key]).toBeDefined();
    }

    const successResponse = await definition.requiredAuthMethods.testAuthRequest(api);
    expect(successResponse).toBeTruthy();
    const savedKeys = {};
    for (const key of definition.requiredAuthMethods.apiPropertiesToPersist.credential){
        savedKeys[key] = api[key];
        delete api[key];
    }
    let validAuth = false;
    try {
        if (await definition.requiredAuthMethods.testAuthRequest(api)) validAuth = true;
    } catch (e) {
        flushDebugLog(e);
    }
    expect(validAuth).not.toBeTruthy();
    Object.assign(api, savedKeys);
}

module.exports = { testDefinitionRequiredAuthMethods }
