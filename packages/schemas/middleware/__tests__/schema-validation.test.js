/**
 * Tests for schema validation middleware
 */

const {
    validateBody,
    validateQuery,
    validateParams,
    validateResponse,
    validate,
    validateData,
    SchemaRefs,
    SchemaValidationError,
    formatValidationErrors
} = require('../schema-validation');

// Mock Express request/response/next
function createMockReq(overrides = {}) {
    return {
        body: {},
        query: {},
        params: {},
        method: 'GET',
        path: '/test',
        ...overrides
    };
}

function createMockRes() {
    const res = {
        statusCode: 200,
        _data: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this._data = data;
            return this;
        }
    };
    return res;
}

function createMockNext() {
    const next = jest.fn();
    return next;
}

describe('Schema Validation Middleware', () => {
    describe('SchemaValidationError', () => {
        it('should create error with correct properties', () => {
            const errors = [{ instancePath: '/name', message: 'must be string' }];
            const error = new SchemaValidationError('Test error', errors, 'body');

            expect(error.name).toBe('SchemaValidationError');
            expect(error.message).toBe('Test error');
            expect(error.errors).toBe(errors);
            expect(error.location).toBe('body');
            expect(error.statusCode).toBe(400);
        });

        it('should have 500 status for response validation', () => {
            const error = new SchemaValidationError('Response error', [], 'response');
            expect(error.statusCode).toBe(500);
        });

        it('should serialize to JSON correctly', () => {
            const errors = [{ instancePath: '/id', message: 'must be string', params: { type: 'string' } }];
            const error = new SchemaValidationError('Validation failed', errors, 'body');
            const json = error.toJSON();

            expect(json.error).toBe('ValidationError');
            expect(json.location).toBe('body');
            expect(json.details).toHaveLength(1);
            expect(json.details[0].path).toBe('/id');
        });
    });

    describe('formatValidationErrors', () => {
        it('should format errors into readable string', () => {
            const errors = [
                { instancePath: '/name', message: 'must be string' },
                { instancePath: '/age', message: 'must be integer' }
            ];
            const formatted = formatValidationErrors(errors);

            expect(formatted).toContain('/name: must be string');
            expect(formatted).toContain('/age: must be integer');
        });

        it('should include allowed values when present', () => {
            const errors = [{
                instancePath: '/status',
                message: 'must be equal to one of the allowed values',
                params: { allowedValues: ['active', 'inactive'] }
            }];
            const formatted = formatValidationErrors(errors);

            expect(formatted).toContain('allowed: active, inactive');
        });

        it('should handle empty errors array', () => {
            expect(formatValidationErrors([])).toBe('Unknown validation error');
            expect(formatValidationErrors(null)).toBe('Unknown validation error');
        });
    });

    describe('validateBody', () => {
        it('should pass valid entity body', () => {
            const middleware = validateBody(SchemaRefs.entity);
            const req = createMockReq({
                body: {
                    id: '507f1f77bcf86cd799439011',
                    type: 'hubspot',
                    credentialId: '507f1f77bcf86cd799439012',
                    userId: '507f1f77bcf86cd799439013',
                    externalId: 'contact_123'
                }
            });
            const res = createMockRes();
            const next = createMockNext();

            middleware(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(res.statusCode).toBe(200);
        });

        it('should reject invalid entity body in strict mode', () => {
            const middleware = validateBody(SchemaRefs.entity);
            const req = createMockReq({
                body: {
                    id: 123, // Should be string
                    type: 'hubspot'
                }
            });
            const res = createMockRes();
            const next = createMockNext();

            middleware(req, res, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.statusCode).toBe(400);
            expect(res._data.error).toBe('ValidationError');
        });

        it('should allow invalid body in non-strict mode', () => {
            const middleware = validateBody(SchemaRefs.entity, { strict: false });
            const req = createMockReq({
                body: {
                    id: 123 // Invalid
                }
            });
            const res = createMockRes();
            const next = createMockNext();

            middleware(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(req.validationErrors).toBeDefined();
            expect(req.validationErrors.body).toBeDefined();
        });
    });

    describe('validateQuery', () => {
        it('should pass valid query parameters', () => {
            const middleware = validateQuery(SchemaRefs.createEntityRequest);
            const req = createMockReq({
                query: {
                    entityType: 'hubspot',
                    data: { credential_id: 'cred123' }
                }
            });
            const res = createMockRes();
            const next = createMockNext();

            middleware(req, res, next);

            expect(next).toHaveBeenCalled();
        });
    });

    describe('validateResponse', () => {
        it('should allow valid response', () => {
            const middleware = validateResponse(SchemaRefs.listEntitiesResponse, { strict: false });
            const req = createMockReq();
            const res = createMockRes();
            const next = createMockNext();

            middleware(req, res, next);

            // Call json with valid data
            res.json({
                entities: [{
                    id: '507f1f77bcf86cd799439011',
                    type: 'hubspot',
                    credentialId: '507f1f77bcf86cd799439012',
                    userId: '507f1f77bcf86cd799439013',
                    externalId: 'contact_123'
                }]
            });

            expect(res._data.entities).toHaveLength(1);
        });

        it('should log errors for invalid response in non-strict mode', () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            const middleware = validateResponse(SchemaRefs.listEntitiesResponse, {
                strict: false,
                logErrors: true
            });
            const req = createMockReq();
            const res = createMockRes();
            const next = createMockNext();

            middleware(req, res, next);

            // Call json with invalid data
            res.json({
                entities: 'not an array' // Invalid
            });

            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });

    describe('validate (combined)', () => {
        it('should create multiple middlewares from config', () => {
            const middlewares = validate({
                body: SchemaRefs.createEntityRequest,
                response: SchemaRefs.createEntityResponse
            });

            expect(middlewares).toHaveLength(2);
            expect(typeof middlewares[0]).toBe('function');
            expect(typeof middlewares[1]).toBe('function');
        });

        it('should create empty array for empty config', () => {
            const middlewares = validate({});
            expect(middlewares).toHaveLength(0);
        });
    });

    describe('validateData (direct validation)', () => {
        it('should validate entity data', () => {
            const result = validateData('entity', {
                id: '507f1f77bcf86cd799439011',
                type: 'hubspot',
                credentialId: '507f1f77bcf86cd799439012',
                userId: '507f1f77bcf86cd799439013',
                externalId: 'contact_123'
            });

            expect(result.valid).toBe(true);
            expect(result.errors).toBeNull();
        });

        it('should return errors for invalid data', () => {
            const result = validateData('entity', {
                id: 123 // Should be string
            });

            expect(result.valid).toBe(false);
            expect(result.errors).toBeDefined();
            expect(result.formatted).toBeDefined();
        });

        it('should throw for unknown schema name', () => {
            expect(() => validateData('unknown_schema', {})).toThrow('Unknown schema name');
        });
    });

    describe('SchemaRefs', () => {
        it('should have all expected entity refs', () => {
            expect(SchemaRefs.entity).toBe('api-entities#/definitions/entity');
            expect(SchemaRefs.listEntitiesResponse).toBe('api-entities#/definitions/listEntitiesResponse');
            expect(SchemaRefs.createEntityRequest).toBe('api-entities#/definitions/createEntityRequest');
            expect(SchemaRefs.createEntityResponse).toBe('api-entities#/definitions/createEntityResponse');
            expect(SchemaRefs.entityType).toBe('api-entities#/definitions/entityType');
            expect(SchemaRefs.reauthorizeEntityRequest).toBe('api-entities#/definitions/reauthorizeEntityRequest');
        });

        it('should have all expected credential refs', () => {
            expect(SchemaRefs.credential).toBe('api-credentials#/definitions/credential');
            expect(SchemaRefs.listCredentialsResponse).toBe('api-credentials#/definitions/listCredentialsResponse');
            expect(SchemaRefs.reauthorizeCredentialRequest).toBe('api-credentials#/definitions/reauthorizeCredentialRequest');
        });

        it('should have all expected proxy refs', () => {
            expect(SchemaRefs.proxyRequest).toBe('api-proxy#/definitions/proxyRequest');
            expect(SchemaRefs.proxyResponse).toBe('api-proxy#/definitions/proxyResponse');
            expect(SchemaRefs.proxyResponseUnion).toBe('api-proxy#/definitions/proxyResponseUnion');
        });

        it('should have all expected authorization refs', () => {
            expect(SchemaRefs.authorizationRequirements).toBe('api-authorization#/definitions/authorizationRequirements');
            expect(SchemaRefs.authorizationRequest).toBe('api-authorization#/definitions/authorizationRequest');
            expect(SchemaRefs.authorizationResponse).toBe('api-authorization#/definitions/authorizationResponse');
        });
    });
});

describe('API Response Validation', () => {
    describe('Entities API', () => {
        it('should validate listEntitiesResponse', () => {
            const result = validateData('listEntitiesResponse', {
                entities: [{
                    id: '507f1f77bcf86cd799439011',
                    type: 'hubspot',
                    credentialId: '507f1f77bcf86cd799439012',
                    userId: '507f1f77bcf86cd799439013',
                    externalId: 'contact_123',
                    name: 'Test Entity',
                    authIsValid: true,
                    createdAt: '2024-01-01T00:00:00Z',
                    updatedAt: '2024-01-01T00:00:00Z'
                }]
            });

            expect(result.valid).toBe(true);
        });

        it('should validate createEntityRequest', () => {
            const result = validateData('createEntityRequest', {
                entityType: 'hubspot',
                data: {
                    credential_id: '507f1f77bcf86cd799439012'
                }
            });

            expect(result.valid).toBe(true);
        });

        it('should validate reauthorizeEntityResponse with success', () => {
            const result = validateData('reauthorizeEntityResponse', {
                success: true,
                credential_id: '507f1f77bcf86cd799439012',
                entity_id: '507f1f77bcf86cd799439011',
                authIsValid: true
            });

            expect(result.valid).toBe(true);
        });

        it('should validate reauthorizeEntityResponse with next step', () => {
            const result = validateData('reauthorizeEntityResponse', {
                step: 2,
                totalSteps: 3,
                sessionId: 'session_123',
                requirements: {
                    type: 'form',
                    fields: ['workspace_id']
                },
                message: 'Please select your workspace'
            });

            expect(result.valid).toBe(true);
        });
    });

    describe('Credentials API', () => {
        it('should validate credential', () => {
            const result = validateData('credential', {
                id: '507f1f77bcf86cd799439012',
                type: 'hubspot',
                userId: '507f1f77bcf86cd799439013',
                externalId: 'hub_123',
                authIsValid: true,
                entityCount: 2,
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-01T00:00:00Z'
            });

            expect(result.valid).toBe(true);
        });

        it('should validate listCredentialsResponse', () => {
            const result = validateData('listCredentialsResponse', {
                credentials: [{
                    id: '507f1f77bcf86cd799439012',
                    type: 'hubspot',
                    userId: '507f1f77bcf86cd799439013',
                    externalId: 'hub_123',
                    authIsValid: true
                }]
            });

            expect(result.valid).toBe(true);
        });

        it('should validate reauthorizeCredentialRequest', () => {
            const result = validateData('reauthorizeCredentialRequest', {
                data: {
                    code: 'auth_code_123',
                    state: 'state_123'
                }
            });

            expect(result.valid).toBe(true);
        });
    });

    describe('Proxy API', () => {
        it('should validate proxyRequest', () => {
            const result = validateData('proxyRequest', {
                method: 'GET',
                path: '/api/v1/contacts'
            });

            expect(result.valid).toBe(true);
        });

        it('should validate proxyRequest with body', () => {
            const result = validateData('proxyRequest', {
                method: 'POST',
                path: '/api/v1/contacts',
                body: {
                    name: 'Test Contact',
                    email: 'test@example.com'
                }
            });

            expect(result.valid).toBe(true);
        });

        it('should validate proxyRequest with headers and query', () => {
            const result = validateData('proxyRequest', {
                method: 'GET',
                path: '/api/v1/contacts',
                headers: {
                    'Accept': 'application/json'
                },
                query: {
                    limit: '10'
                }
            });

            expect(result.valid).toBe(true);
        });
    });

    describe('Authorization API', () => {
        it('should validate authorizationRequirements', () => {
            const result = validateData('authorizationRequirements', {
                type: 'oauth2',
                step: 1,
                totalSteps: 1,
                isMultiStep: false,
                data: {
                    url: 'https://auth.example.com/oauth/authorize',
                    scopes: ['read', 'write']
                }
            });

            expect(result.valid).toBe(true);
        });

        it('should validate authorizationRequest', () => {
            const result = validateData('authorizationRequest', {
                entityType: 'hubspot',
                data: {
                    code: 'auth_code_123',
                    state: 'state_123'
                }
            });

            expect(result.valid).toBe(true);
        });

        it('should validate authorizationResponse with success', () => {
            const result = validateData('authorizationResponse', {
                entity_id: '507f1f77bcf86cd799439011',
                credential_id: '507f1f77bcf86cd799439012',
                type: 'hubspot',
                display: 'HubSpot Account'
            });

            expect(result.valid).toBe(true);
        });

        it('should validate authorizationResponse with next step', () => {
            const result = validateData('authorizationResponse', {
                nextStep: 2,
                sessionId: 'session_123',
                requirements: {
                    type: 'form',
                    step: 2,
                    totalSteps: 2,
                    isMultiStep: true,
                    data: {
                        jsonSchema: {
                            type: 'object',
                            properties: {
                                workspace_id: { type: 'string' }
                            }
                        }
                    }
                },
                message: 'Please select your workspace'
            });

            expect(result.valid).toBe(true);
        });
    });
});
