const { OAuthTokenRefreshScript } = require('../oauth-token-refresh');

describe('OAuthTokenRefreshScript', () => {
    describe('Definition', () => {
        it('should have correct name and metadata', () => {
            expect(OAuthTokenRefreshScript.Definition.name).toBe(
                'oauth-token-refresh'
            );
            expect(OAuthTokenRefreshScript.Definition.version).toBe('1.0.0');
            expect(OAuthTokenRefreshScript.Definition.source).toBe('BUILTIN');
            expect(
                OAuthTokenRefreshScript.Definition.config
                    .requireIntegrationInstance
            ).toBe(true);
        });

        it('should have valid input schema', () => {
            const schema = OAuthTokenRefreshScript.Definition.inputSchema;
            expect(schema.type).toBe('object');
            expect(schema.properties.integrationIds).toBeDefined();
            expect(schema.properties.expiryThresholdHours).toBeDefined();
            expect(schema.properties.dryRun).toBeDefined();
        });

        it('should have valid output schema', () => {
            const schema = OAuthTokenRefreshScript.Definition.outputSchema;
            expect(schema.type).toBe('object');
            expect(schema.properties.refreshed).toBeDefined();
            expect(schema.properties.failed).toBeDefined();
            expect(schema.properties.skipped).toBeDefined();
            expect(schema.properties.details).toBeDefined();
        });

        it('should have appropriate timeout configuration', () => {
            expect(OAuthTokenRefreshScript.Definition.config.timeout).toBe(
                600000
            ); // 10 minutes
        });

        it('should have clean display object without redundant fields', () => {
            expect(OAuthTokenRefreshScript.Definition.display).toBeDefined();
            expect(OAuthTokenRefreshScript.Definition.display.category).toBe(
                'maintenance'
            );
            // Should NOT have redundant label/description
            expect(
                OAuthTokenRefreshScript.Definition.display.label
            ).toBeUndefined();
            expect(
                OAuthTokenRefreshScript.Definition.display.description
            ).toBeUndefined();
        });
    });

    describe('execute()', () => {
        let script;
        let mockContext;

        beforeEach(() => {
            mockContext = {
                log: jest.fn(),
                integrationRepository: {
                    findIntegrations: jest.fn(),
                    findIntegrationById: jest.fn(),
                },
                instantiate: jest.fn(),
            };
            script = new OAuthTokenRefreshScript({ context: mockContext });
        });

        it('should return empty results when no integrations found', async () => {
            mockContext.integrationRepository.findIntegrations.mockResolvedValue(
                []
            );

            const result = await script.execute({});

            expect(result.refreshed).toBe(0);
            expect(result.failed).toBe(0);
            expect(result.skipped).toBe(0);
            expect(result.details).toEqual([]);
            expect(mockContext.log).toHaveBeenCalledWith(
                'info',
                expect.any(String),
                expect.any(Object)
            );
        });

        it('should skip integrations without OAuth credentials', async () => {
            const integration = {
                id: 'int-1',
                config: {}, // No credentials
            };
            mockContext.integrationRepository.findIntegrations.mockResolvedValue(
                [integration]
            );

            const result = await script.execute({});

            expect(result.skipped).toBe(1);
            expect(result.refreshed).toBe(0);
            expect(result.details[0]).toMatchObject({
                integrationId: 'int-1',
                action: 'skipped',
                reason: 'No OAuth credentials found',
            });
        });

        it('should skip integrations without expiry time', async () => {
            const integration = {
                id: 'int-1',
                config: {
                    credentials: {
                        access_token: 'token123',
                        // No expires_at
                    },
                },
            };
            mockContext.integrationRepository.findIntegrations.mockResolvedValue(
                [integration]
            );

            const result = await script.execute({});

            expect(result.skipped).toBe(1);
            expect(result.details[0]).toMatchObject({
                integrationId: 'int-1',
                action: 'skipped',
                reason: 'No expiry time found',
            });
        });

        it('should skip tokens not near expiry', async () => {
            const farFutureExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours from now
            const integration = {
                id: 'int-1',
                config: {
                    credentials: {
                        access_token: 'token123',
                        expires_at: farFutureExpiry.toISOString(),
                    },
                },
            };
            mockContext.integrationRepository.findIntegrations.mockResolvedValue(
                [integration]
            );

            const result = await script.execute({
                expiryThresholdHours: 24,
            });

            expect(result.skipped).toBe(1);
            expect(result.details[0]).toMatchObject({
                integrationId: 'int-1',
                action: 'skipped',
                reason: 'Token not near expiry',
            });
        });

        it('should refresh tokens that are near expiry', async () => {
            const soonExpiry = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours from now
            const integration = {
                id: 'int-1',
                config: {
                    credentials: {
                        access_token: 'token123',
                        expires_at: soonExpiry.toISOString(),
                    },
                },
            };

            const mockInstance = {
                primary: {
                    api: {
                        refreshAccessToken: jest
                            .fn()
                            .mockResolvedValue(undefined),
                    },
                },
            };

            mockContext.integrationRepository.findIntegrations.mockResolvedValue(
                [integration]
            );
            mockContext.instantiate.mockResolvedValue(mockInstance);

            const result = await script.execute({
                expiryThresholdHours: 24,
            });

            expect(result.refreshed).toBe(1);
            expect(result.skipped).toBe(0);
            expect(
                mockInstance.primary.api.refreshAccessToken
            ).toHaveBeenCalled();
            expect(result.details[0]).toMatchObject({
                integrationId: 'int-1',
                action: 'refreshed',
            });
        });

        it('should handle dryRun mode correctly', async () => {
            const soonExpiry = new Date(Date.now() + 12 * 60 * 60 * 1000);
            const integration = {
                id: 'int-1',
                config: {
                    credentials: {
                        access_token: 'token123',
                        expires_at: soonExpiry.toISOString(),
                    },
                },
            };

            mockContext.integrationRepository.findIntegrations.mockResolvedValue(
                [integration]
            );

            const result = await script.execute({
                expiryThresholdHours: 24,
                dryRun: true,
            });

            expect(result.refreshed).toBe(0);
            expect(result.skipped).toBe(1);
            expect(mockContext.instantiate).not.toHaveBeenCalled();
            expect(result.details[0]).toMatchObject({
                integrationId: 'int-1',
                action: 'skipped',
                reason: 'Dry run - would have refreshed',
            });
        });

        it('should handle refresh failures gracefully', async () => {
            const soonExpiry = new Date(Date.now() + 12 * 60 * 60 * 1000);
            const integration = {
                id: 'int-1',
                config: {
                    credentials: {
                        access_token: 'token123',
                        expires_at: soonExpiry.toISOString(),
                    },
                },
            };

            const mockInstance = {
                primary: {
                    api: {
                        refreshAccessToken: jest
                            .fn()
                            .mockRejectedValue(new Error('API Error')),
                    },
                },
            };

            mockContext.integrationRepository.findIntegrations.mockResolvedValue(
                [integration]
            );
            mockContext.instantiate.mockResolvedValue(mockInstance);

            const result = await script.execute({
                expiryThresholdHours: 24,
            });

            expect(result.failed).toBe(1);
            expect(result.refreshed).toBe(0);
            expect(result.details[0]).toMatchObject({
                integrationId: 'int-1',
                action: 'failed',
                reason: 'API Error',
            });
        });

        it('should skip integrations without refresh support', async () => {
            const soonExpiry = new Date(Date.now() + 12 * 60 * 60 * 1000);
            const integration = {
                id: 'int-1',
                config: {
                    credentials: {
                        access_token: 'token123',
                        expires_at: soonExpiry.toISOString(),
                    },
                },
            };

            const mockInstance = {
                primary: {
                    api: {
                        // No refreshAccessToken method
                    },
                },
            };

            mockContext.integrationRepository.findIntegrations.mockResolvedValue(
                [integration]
            );
            mockContext.instantiate.mockResolvedValue(mockInstance);

            const result = await script.execute({
                expiryThresholdHours: 24,
            });

            expect(result.skipped).toBe(1);
            expect(result.details[0]).toMatchObject({
                integrationId: 'int-1',
                action: 'skipped',
                reason: 'API does not support token refresh',
            });
        });

        it('should filter by specific integration IDs', async () => {
            const integration1 = {
                id: 'int-1',
                config: { credentials: { access_token: 'token1' } },
            };
            const integration2 = {
                id: 'int-2',
                config: { credentials: { access_token: 'token2' } },
            };

            mockContext.integrationRepository.findIntegrationById.mockImplementation(
                (id) => {
                    if (id === 'int-1') return Promise.resolve(integration1);
                    if (id === 'int-2') return Promise.resolve(integration2);
                    return Promise.reject(new Error('Not found'));
                }
            );

            const result = await script.execute({
                integrationIds: ['int-1', 'int-2'],
            });

            expect(
                mockContext.integrationRepository.findIntegrationById
            ).toHaveBeenCalledWith('int-1');
            expect(
                mockContext.integrationRepository.findIntegrationById
            ).toHaveBeenCalledWith('int-2');
            expect(
                mockContext.integrationRepository.findIntegrations
            ).not.toHaveBeenCalled();
            expect(result.details).toHaveLength(2);
        });

        it('should handle errors when processing integrations', async () => {
            const integration = {
                id: 'int-1',
                config: {
                    credentials: {
                        access_token: 'token123',
                        expires_at: new Date(
                            Date.now() + 12 * 60 * 60 * 1000
                        ).toISOString(),
                    },
                },
            };

            mockContext.integrationRepository.findIntegrations.mockResolvedValue(
                [integration]
            );
            mockContext.instantiate.mockRejectedValue(
                new Error('Instantiation failed')
            );

            const result = await script.execute({
                expiryThresholdHours: 24,
            });

            expect(result.failed).toBe(1);
            expect(result.details[0]).toMatchObject({
                integrationId: 'int-1',
                action: 'failed',
                reason: 'Instantiation failed',
            });
        });
    });

    describe('processIntegration()', () => {
        let script;
        let mockContext;

        beforeEach(() => {
            mockContext = {
                log: jest.fn(),
                instantiate: jest.fn(),
            };
            script = new OAuthTokenRefreshScript({ context: mockContext });
        });

        it('should return correct detail object for each scenario', async () => {
            // Test various scenarios are covered in execute() tests above
            // This test validates the method can be called directly
            const integration = {
                id: 'int-1',
                config: {},
            };

            const result = await script.processIntegration(integration, {
                expiryThresholdHours: 24,
                dryRun: false,
            });

            expect(result).toHaveProperty('integrationId');
            expect(result).toHaveProperty('action');
            expect(result).toHaveProperty('reason');
        });
    });
});
