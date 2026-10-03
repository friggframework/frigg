const { toEntityDto, maskCredential } = require('../dto');
const { objectBody, requireFields, parseStep, optionalString } = require('../request');

/** The v2 body for a submitted step: masked records when complete. */
function toAuthorizationResponse(result) {
    if (result.status !== 'complete') return result;
    return {
        status: 'complete',
        entity: result.entity ? toEntityDto(result.entity) : null,
        credential: result.credential ? maskCredential(result.credential) : null,
        ...(result.previousCredentialId && {
            previousCredentialId: result.previousCredentialId,
        }),
    };
}

/**
 * Management API v2 authorization handlers (multi-step authorize and
 * credential re-authorization), keyed by operationId.
 */
function createAuthorizationHandlers(useCases) {
    const {
        getAuthorizationStep,
        submitAuthorizationStep,
        getCredentialReauthorization,
        reauthorizeCredentialForUser,
    } = useCases;

    const stepQuery = (req) => ({
        step: parseStep(req.query.step),
        sessionId: optionalString(req.query.sessionId, 'sessionId'),
        state: optionalString(req.query.state, 'state'),
    });

    const stepBody = (req) => {
        const body = objectBody(req);
        return {
            body,
            step: parseStep(body.step),
            sessionId: optionalString(body.sessionId, 'sessionId'),
        };
    };

    return {
        async getAuthorizationRequirements(req, res, user) {
            const entityType = optionalString(req.query.entityType, 'entityType');
            requireFields({ entityType }, ['entityType']);
            res.json(
                await getAuthorizationStep.execute({
                    user,
                    entityType,
                    ...stepQuery(req),
                })
            );
        },

        async authorize(req, res, user) {
            const { body, step, sessionId } = stepBody(req);
            requireFields(body, ['entityType', 'data']);
            const result = await submitAuthorizationStep.execute({
                user,
                entityType: optionalString(body.entityType, 'entityType'),
                data: body.data,
                step,
                sessionId,
            });
            res.json(toAuthorizationResponse(result));
        },

        async getCredentialReauthorizeRequirements(req, res, user) {
            res.json(
                await getCredentialReauthorization.execute(
                    req.params.credentialId,
                    user,
                    stepQuery(req)
                )
            );
        },

        async reauthorizeCredential(req, res, user) {
            const { body, step, sessionId } = stepBody(req);
            requireFields(body, ['data']);
            const result = await reauthorizeCredentialForUser.execute(
                req.params.credentialId,
                user,
                { data: body.data, step, sessionId }
            );
            res.json(toAuthorizationResponse(result));
        },
    };
}

module.exports = { createAuthorizationHandlers, toAuthorizationResponse };
