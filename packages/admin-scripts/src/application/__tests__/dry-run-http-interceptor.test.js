const {
    createDryRunHttpClient,
    injectDryRunHttpClient,
    sanitizeHeaders,
    sanitizeData,
    detectService,
} = require('../dry-run-http-interceptor');

describe('Dry-Run HTTP Interceptor', () => {
    describe('sanitizeHeaders', () => {
        test('should redact authorization headers', () => {
            const headers = {
                'Content-Type': 'application/json',
                Authorization: 'Bearer secret-token',
                'X-API-Key': 'api-key-123',
                'User-Agent': 'frigg/1.0',
            };

            const sanitized = sanitizeHeaders(headers);

            expect(sanitized['Content-Type']).toBe('application/json');
            expect(sanitized['User-Agent']).toBe('frigg/1.0');
            expect(sanitized.Authorization).toBe('[REDACTED]');
            expect(sanitized['X-API-Key']).toBe('[REDACTED]');
        });

        test('should handle case variations', () => {
            const headers = {
                authorization: 'Bearer token',
                Authorization: 'Bearer token',
                'x-api-key': 'key1',
                'X-API-Key': 'key2',
            };

            const sanitized = sanitizeHeaders(headers);

            expect(sanitized.authorization).toBe('[REDACTED]');
            expect(sanitized.Authorization).toBe('[REDACTED]');
            expect(sanitized['x-api-key']).toBe('[REDACTED]');
            expect(sanitized['X-API-Key']).toBe('[REDACTED]');
        });

        test('should handle null/undefined', () => {
            expect(sanitizeHeaders(null)).toEqual({});
            expect(sanitizeHeaders(undefined)).toEqual({});
            expect(sanitizeHeaders({})).toEqual({});
        });
    });

    describe('detectService', () => {
        test('should detect CRM services', () => {
            expect(detectService('https://api.hubapi.com')).toBe('HubSpot');
            expect(detectService('https://login.salesforce.com')).toBe('Salesforce');
            expect(detectService('https://api.pipedrive.com')).toBe('Pipedrive');
            expect(detectService('https://api.attio.com')).toBe('Attio');
        });

        test('should detect communication services', () => {
            expect(detectService('https://slack.com/api')).toBe('Slack');
            expect(detectService('https://discord.com/api')).toBe('Discord');
            expect(detectService('https://graph.teams.microsoft.com')).toBe('Microsoft Teams');
        });

        test('should detect project management tools', () => {
            expect(detectService('https://app.asana.com/api')).toBe('Asana');
            expect(detectService('https://api.monday.com')).toBe('Monday.com');
            expect(detectService('https://api.trello.com')).toBe('Trello');
        });

        test('should return unknown for unrecognized services', () => {
            expect(detectService('https://example.com/api')).toBe('unknown');
            expect(detectService(null)).toBe('unknown');
            expect(detectService(undefined)).toBe('unknown');
        });

        test('should be case insensitive', () => {
            expect(detectService('HTTPS://API.HUBSPOT.COM')).toBe('HubSpot');
            expect(detectService('https://API.SLACK.COM')).toBe('Slack');
        });
    });

    describe('sanitizeData', () => {
        test('should redact sensitive fields', () => {
            const data = {
                name: 'Test User',
                email: 'test@example.com',
                password: 'secret123',
                apiToken: 'token-abc',
                authKey: 'key-xyz',
            };

            const sanitized = sanitizeData(data);

            expect(sanitized.name).toBe('Test User');
            expect(sanitized.email).toBe('test@example.com');
            expect(sanitized.password).toBe('[REDACTED]');
            expect(sanitized.apiToken).toBe('[REDACTED]');
            expect(sanitized.authKey).toBe('[REDACTED]');
        });

        test('should handle nested objects', () => {
            const data = {
                user: {
                    name: 'Test',
                    credentials: {
                        password: 'secret',
                        token: 'abc123',
                    },
                },
            };

            const sanitized = sanitizeData(data);

            expect(sanitized.user.name).toBe('Test');
            expect(sanitized.user.credentials.password).toBe('[REDACTED]');
            expect(sanitized.user.credentials.token).toBe('[REDACTED]');
        });

        test('should handle arrays', () => {
            const data = [
                { id: '1', password: 'secret1' },
                { id: '2', apiKey: 'key2' },
            ];

            const sanitized = sanitizeData(data);

            expect(sanitized[0].id).toBe('1');
            expect(sanitized[0].password).toBe('[REDACTED]');
            expect(sanitized[1].apiKey).toBe('[REDACTED]');
        });

        test('should preserve primitives', () => {
            expect(sanitizeData('string')).toBe('string');
            expect(sanitizeData(123)).toBe(123);
            expect(sanitizeData(true)).toBe(true);
            expect(sanitizeData(null)).toBe(null);
            expect(sanitizeData(undefined)).toBe(undefined);
        });
    });

    describe('createDryRunHttpClient', () => {
        let operationLog;

        beforeEach(() => {
            operationLog = [];
        });

        test('should log GET requests', async () => {
            const client = createDryRunHttpClient(operationLog);

            const response = await client.get('/contacts', {
                baseURL: 'https://api.hubapi.com',
                headers: { Authorization: 'Bearer token' },
            });

            expect(operationLog).toHaveLength(1);
            expect(operationLog[0]).toMatchObject({
                operation: 'HTTP_REQUEST',
                method: 'GET',
                url: 'https://api.hubapi.com/contacts',
                service: 'HubSpot',
            });

            expect(operationLog[0].headers.Authorization).toBe('[REDACTED]');
            expect(response.data._dryRun).toBe(true);
        });

        test('should log POST requests with data', async () => {
            const client = createDryRunHttpClient(operationLog);

            const postData = {
                name: 'John Doe',
                email: 'john@example.com',
                password: 'secret123',
            };

            await client.post('/users', postData, {
                baseURL: 'https://api.example.com',
            });

            expect(operationLog).toHaveLength(1);
            expect(operationLog[0].method).toBe('POST');
            expect(operationLog[0].data.name).toBe('John Doe');
            expect(operationLog[0].data.email).toBe('john@example.com');
            expect(operationLog[0].data.password).toBe('[REDACTED]');
        });

        test('should log PUT requests', async () => {
            const client = createDryRunHttpClient(operationLog);

            await client.put('/users/123', { status: 'active' }, {
                baseURL: 'https://api.example.com',
            });

            expect(operationLog).toHaveLength(1);
            expect(operationLog[0].method).toBe('PUT');
            expect(operationLog[0].data.status).toBe('active');
        });

        test('should log PATCH requests', async () => {
            const client = createDryRunHttpClient(operationLog);

            await client.patch('/users/123', { name: 'Updated' });

            expect(operationLog).toHaveLength(1);
            expect(operationLog[0].method).toBe('PATCH');
        });

        test('should log DELETE requests', async () => {
            const client = createDryRunHttpClient(operationLog);

            await client.delete('/users/123', {
                baseURL: 'https://api.example.com',
            });

            expect(operationLog).toHaveLength(1);
            expect(operationLog[0].method).toBe('DELETE');
        });

        test('should return mock response', async () => {
            const client = createDryRunHttpClient(operationLog);

            const response = await client.get('/test');

            expect(response.status).toBe(200);
            expect(response.statusText).toContain('Dry-Run');
            expect(response.data._dryRun).toBe(true);
            expect(response.headers['x-dry-run']).toBe('true');
        });

        test('should include query params in log', async () => {
            const client = createDryRunHttpClient(operationLog);

            await client.get('/search', {
                baseURL: 'https://api.example.com',
                params: { q: 'test', limit: 10 },
            });

            expect(operationLog[0].params).toEqual({ q: 'test', limit: 10 });
        });
    });

    describe('injectDryRunHttpClient', () => {
        let operationLog;
        let dryRunClient;

        beforeEach(() => {
            operationLog = [];
            dryRunClient = createDryRunHttpClient(operationLog);
        });

        test('should inject into primary API module', () => {
            const integrationInstance = {
                primary: {
                    api: {
                        _httpClient: { get: jest.fn() },
                    },
                },
            };

            injectDryRunHttpClient(integrationInstance, dryRunClient);

            expect(integrationInstance.primary.api._httpClient).toBe(dryRunClient);
        });

        test('should inject into target API module', () => {
            const integrationInstance = {
                target: {
                    api: {
                        _httpClient: { get: jest.fn() },
                    },
                },
            };

            injectDryRunHttpClient(integrationInstance, dryRunClient);

            expect(integrationInstance.target.api._httpClient).toBe(dryRunClient);
        });

        test('should inject into both primary and target', () => {
            const integrationInstance = {
                primary: {
                    api: { _httpClient: { get: jest.fn() } },
                },
                target: {
                    api: { _httpClient: { get: jest.fn() } },
                },
            };

            injectDryRunHttpClient(integrationInstance, dryRunClient);

            expect(integrationInstance.primary.api._httpClient).toBe(dryRunClient);
            expect(integrationInstance.target.api._httpClient).toBe(dryRunClient);
        });

        test('should handle missing api modules gracefully', () => {
            const integrationInstance = {
                primary: {},
                target: null,
            };

            expect(() => {
                injectDryRunHttpClient(integrationInstance, dryRunClient);
            }).not.toThrow();
        });

        test('should handle null integration instance', () => {
            expect(() => {
                injectDryRunHttpClient(null, dryRunClient);
            }).not.toThrow();
        });
    });
});
