const { IntegrationHealthCheckScript } = require('../integration-health-check');

describe('IntegrationHealthCheckScript', () => {
    describe('Definition', () => {
        it('should have correct name and metadata', () => {
            expect(IntegrationHealthCheckScript.Definition.name).toBe('integration-health-check');
            expect(IntegrationHealthCheckScript.Definition.version).toBe('1.0.0');
            expect(IntegrationHealthCheckScript.Definition.source).toBe('BUILTIN');
            expect(IntegrationHealthCheckScript.Definition.config.requiresIntegrationFactory).toBe(true);
        });

        it('should have valid input schema', () => {
            const schema = IntegrationHealthCheckScript.Definition.inputSchema;
            expect(schema.type).toBe('object');
            expect(schema.properties.integrationIds).toBeDefined();
            expect(schema.properties.checkCredentials).toBeDefined();
            expect(schema.properties.checkConnectivity).toBeDefined();
            expect(schema.properties.updateStatus).toBeDefined();
        });

        it('should have valid output schema', () => {
            const schema = IntegrationHealthCheckScript.Definition.outputSchema;
            expect(schema.type).toBe('object');
            expect(schema.properties.healthy).toBeDefined();
            expect(schema.properties.unhealthy).toBeDefined();
            expect(schema.properties.unknown).toBeDefined();
            expect(schema.properties.results).toBeDefined();
        });

        it('should have schedule configuration', () => {
            const schedule = IntegrationHealthCheckScript.Definition.schedule;
            expect(schedule).toBeDefined();
            expect(schedule.enabled).toBe(false);
            expect(schedule.cronExpression).toBe('cron(0 6 * * ? *)');
        });

        it('should have appropriate timeout configuration', () => {
            expect(IntegrationHealthCheckScript.Definition.config.timeout).toBe(900000); // 15 minutes
        });
    });

    describe('execute()', () => {
        let script;
        let mockFrigg;

        beforeEach(() => {
            script = new IntegrationHealthCheckScript();
            mockFrigg = {
                log: jest.fn(),
                listIntegrations: jest.fn(),
                findIntegrationById: jest.fn(),
                instantiate: jest.fn(),
                updateIntegrationStatus: jest.fn(),
            };
        });

        it('should return empty results when no integrations found', async () => {
            mockFrigg.listIntegrations.mockResolvedValue([]);

            const result = await script.execute(mockFrigg, {});

            expect(result.healthy).toBe(0);
            expect(result.unhealthy).toBe(0);
            expect(result.unknown).toBe(0);
            expect(result.results).toEqual([]);
        });

        it('should return healthy for valid integrations', async () => {
            const integration = {
                id: 'int-1',
                config: {
                    type: 'hubspot',
                    credentials: {
                        access_token: 'token123',
                        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
                    }
                }
            };

            const mockInstance = {
                primary: {
                    api: {
                        getAuthenticationInfo: jest.fn().mockResolvedValue({ user: 'test' })
                    }
                }
            };

            mockFrigg.listIntegrations.mockResolvedValue([integration]);
            mockFrigg.instantiate.mockResolvedValue(mockInstance);

            const result = await script.execute(mockFrigg, {
                checkCredentials: true,
                checkConnectivity: true
            });

            expect(result.healthy).toBe(1);
            expect(result.unhealthy).toBe(0);
            expect(result.results[0]).toMatchObject({
                integrationId: 'int-1',
                status: 'healthy',
                issues: []
            });
            expect(mockInstance.primary.api.getAuthenticationInfo).toHaveBeenCalled();
        });

        it('should return unhealthy for missing access token', async () => {
            const integration = {
                id: 'int-1',
                config: {
                    type: 'hubspot',
                    credentials: {} // No access_token
                }
            };

            mockFrigg.listIntegrations.mockResolvedValue([integration]);

            const result = await script.execute(mockFrigg, {
                checkCredentials: true,
                checkConnectivity: false
            });

            expect(result.healthy).toBe(0);
            expect(result.unhealthy).toBe(1);
            expect(result.results[0]).toMatchObject({
                integrationId: 'int-1',
                status: 'unhealthy',
                issues: ['Missing access token']
            });
        });

        it('should return unhealthy for expired credentials', async () => {
            const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
            const integration = {
                id: 'int-1',
                config: {
                    type: 'hubspot',
                    credentials: {
                        access_token: 'token123',
                        expires_at: pastDate.toISOString()
                    }
                }
            };

            mockFrigg.listIntegrations.mockResolvedValue([integration]);

            const result = await script.execute(mockFrigg, {
                checkCredentials: true,
                checkConnectivity: false
            });

            expect(result.unhealthy).toBe(1);
            expect(result.results[0]).toMatchObject({
                integrationId: 'int-1',
                status: 'unhealthy',
                issues: ['Access token expired']
            });
        });

        it('should return unhealthy for connectivity failures', async () => {
            const integration = {
                id: 'int-1',
                config: {
                    type: 'hubspot',
                    credentials: {
                        access_token: 'token123',
                        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
                    }
                }
            };

            const mockInstance = {
                primary: {
                    api: {
                        getAuthenticationInfo: jest.fn().mockRejectedValue(new Error('Network error'))
                    }
                }
            };

            mockFrigg.listIntegrations.mockResolvedValue([integration]);
            mockFrigg.instantiate.mockResolvedValue(mockInstance);

            const result = await script.execute(mockFrigg, {
                checkCredentials: true,
                checkConnectivity: true
            });

            expect(result.unhealthy).toBe(1);
            expect(result.results[0].status).toBe('unhealthy');
            expect(result.results[0].issues).toContainEqual(expect.stringContaining('API connectivity failed'));
        });

        it('should update integration status when updateStatus is true', async () => {
            const integration = {
                id: 'int-1',
                config: {
                    type: 'hubspot',
                    credentials: {
                        access_token: 'token123',
                        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
                    }
                }
            };

            const mockInstance = {
                primary: {
                    api: {
                        getAuthenticationInfo: jest.fn().mockResolvedValue({ user: 'test' })
                    }
                }
            };

            mockFrigg.listIntegrations.mockResolvedValue([integration]);
            mockFrigg.instantiate.mockResolvedValue(mockInstance);
            mockFrigg.updateIntegrationStatus.mockResolvedValue(undefined);

            const result = await script.execute(mockFrigg, {
                checkCredentials: true,
                checkConnectivity: true,
                updateStatus: true
            });

            expect(result.healthy).toBe(1);
            expect(mockFrigg.updateIntegrationStatus).toHaveBeenCalledWith('int-1', 'ACTIVE');
        });

        it('should update integration status to ERROR for unhealthy integrations', async () => {
            const integration = {
                id: 'int-1',
                config: {
                    type: 'hubspot',
                    credentials: {} // Missing credentials
                }
            };

            mockFrigg.listIntegrations.mockResolvedValue([integration]);
            mockFrigg.updateIntegrationStatus.mockResolvedValue(undefined);

            const result = await script.execute(mockFrigg, {
                checkCredentials: true,
                checkConnectivity: false,
                updateStatus: true
            });

            expect(result.unhealthy).toBe(1);
            expect(mockFrigg.updateIntegrationStatus).toHaveBeenCalledWith('int-1', 'ERROR');
        });

        it('should not update status when updateStatus is false', async () => {
            const integration = {
                id: 'int-1',
                config: {
                    type: 'hubspot',
                    credentials: {
                        access_token: 'token123',
                        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
                    }
                }
            };

            const mockInstance = {
                primary: {
                    api: {
                        getAuthenticationInfo: jest.fn().mockResolvedValue({ user: 'test' })
                    }
                }
            };

            mockFrigg.listIntegrations.mockResolvedValue([integration]);
            mockFrigg.instantiate.mockResolvedValue(mockInstance);

            await script.execute(mockFrigg, {
                checkCredentials: true,
                checkConnectivity: true,
                updateStatus: false
            });

            expect(mockFrigg.updateIntegrationStatus).not.toHaveBeenCalled();
        });

        it('should handle status update failures gracefully', async () => {
            const integration = {
                id: 'int-1',
                config: {
                    type: 'hubspot',
                    credentials: {
                        access_token: 'token123',
                        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
                    }
                }
            };

            const mockInstance = {
                primary: {
                    api: {
                        getAuthenticationInfo: jest.fn().mockResolvedValue({ user: 'test' })
                    }
                }
            };

            mockFrigg.listIntegrations.mockResolvedValue([integration]);
            mockFrigg.instantiate.mockResolvedValue(mockInstance);
            mockFrigg.updateIntegrationStatus.mockRejectedValue(new Error('Update failed'));

            const result = await script.execute(mockFrigg, {
                checkCredentials: true,
                checkConnectivity: true,
                updateStatus: true
            });

            expect(result.healthy).toBe(1); // Should still report healthy
            expect(mockFrigg.log).toHaveBeenCalledWith(
                'warn',
                expect.stringContaining('Failed to update status'),
                expect.any(Object)
            );
        });

        it('should filter by specific integration IDs', async () => {
            const integration1 = {
                id: 'int-1',
                config: { type: 'hubspot', credentials: { access_token: 'token1' } }
            };
            const integration2 = {
                id: 'int-2',
                config: { type: 'salesforce', credentials: { access_token: 'token2' } }
            };

            mockFrigg.findIntegrationById.mockImplementation((id) => {
                if (id === 'int-1') return Promise.resolve(integration1);
                if (id === 'int-2') return Promise.resolve(integration2);
                return Promise.reject(new Error('Not found'));
            });

            const result = await script.execute(mockFrigg, {
                integrationIds: ['int-1', 'int-2'],
                checkCredentials: true,
                checkConnectivity: false
            });

            expect(mockFrigg.findIntegrationById).toHaveBeenCalledWith('int-1');
            expect(mockFrigg.findIntegrationById).toHaveBeenCalledWith('int-2');
            expect(mockFrigg.listIntegrations).not.toHaveBeenCalled();
            expect(result.results).toHaveLength(2);
        });

        it('should handle errors when checking integrations', async () => {
            const integration = {
                id: 'int-1',
                config: {
                    type: 'hubspot',
                    credentials: {
                        access_token: 'token123',
                        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
                    }
                }
            };

            mockFrigg.listIntegrations.mockResolvedValue([integration]);
            mockFrigg.instantiate.mockRejectedValue(new Error('Instantiation failed'));

            const result = await script.execute(mockFrigg, {
                checkCredentials: true,
                checkConnectivity: true
            });

            // Should still complete but mark as unknown or unhealthy
            expect(result.results).toHaveLength(1);
            expect(result.results[0].integrationId).toBe('int-1');
        });

        it('should skip credential check when checkCredentials is false', async () => {
            const integration = {
                id: 'int-1',
                config: {
                    type: 'hubspot',
                    credentials: {} // Missing credentials, but check is disabled
                }
            };

            const mockInstance = {
                primary: {
                    api: {
                        getAuthenticationInfo: jest.fn().mockResolvedValue({ user: 'test' })
                    }
                }
            };

            mockFrigg.listIntegrations.mockResolvedValue([integration]);
            mockFrigg.instantiate.mockResolvedValue(mockInstance);

            const result = await script.execute(mockFrigg, {
                checkCredentials: false,
                checkConnectivity: true
            });

            expect(result.results[0].checks.credentials).toBeUndefined();
            expect(result.results[0].checks.connectivity).toBeDefined();
        });

        it('should skip connectivity check when checkConnectivity is false', async () => {
            const integration = {
                id: 'int-1',
                config: {
                    type: 'hubspot',
                    credentials: {
                        access_token: 'token123',
                        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
                    }
                }
            };

            mockFrigg.listIntegrations.mockResolvedValue([integration]);

            const result = await script.execute(mockFrigg, {
                checkCredentials: true,
                checkConnectivity: false
            });

            expect(result.results[0].checks.credentials).toBeDefined();
            expect(result.results[0].checks.connectivity).toBeUndefined();
            expect(mockFrigg.instantiate).not.toHaveBeenCalled();
        });
    });

    describe('checkCredentialValidity()', () => {
        let script;

        beforeEach(() => {
            script = new IntegrationHealthCheckScript();
        });

        it('should return valid for integrations with valid credentials', () => {
            const integration = {
                id: 'int-1',
                config: {
                    credentials: {
                        access_token: 'token123',
                        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
                    }
                }
            };

            const result = script.checkCredentialValidity(integration);

            expect(result.valid).toBe(true);
            expect(result.issue).toBeNull();
        });

        it('should return invalid for missing access token', () => {
            const integration = {
                id: 'int-1',
                config: {
                    credentials: {}
                }
            };

            const result = script.checkCredentialValidity(integration);

            expect(result.valid).toBe(false);
            expect(result.issue).toBe('Missing access token');
        });

        it('should return invalid for expired tokens', () => {
            const integration = {
                id: 'int-1',
                config: {
                    credentials: {
                        access_token: 'token123',
                        expires_at: new Date(Date.now() - 1000).toISOString() // Expired
                    }
                }
            };

            const result = script.checkCredentialValidity(integration);

            expect(result.valid).toBe(false);
            expect(result.issue).toBe('Access token expired');
        });

        it('should return valid for credentials without expiry', () => {
            const integration = {
                id: 'int-1',
                config: {
                    credentials: {
                        access_token: 'token123'
                        // No expires_at
                    }
                }
            };

            const result = script.checkCredentialValidity(integration);

            expect(result.valid).toBe(true);
            expect(result.issue).toBeNull();
        });
    });

    describe('checkApiConnectivity()', () => {
        let script;
        let mockFrigg;

        beforeEach(() => {
            script = new IntegrationHealthCheckScript();
            mockFrigg = {
                instantiate: jest.fn(),
            };
        });

        it('should return valid for successful API calls', async () => {
            const integration = {
                id: 'int-1',
                config: { type: 'hubspot' }
            };

            const mockInstance = {
                primary: {
                    api: {
                        getAuthenticationInfo: jest.fn().mockResolvedValue({ user: 'test' })
                    }
                }
            };

            mockFrigg.instantiate.mockResolvedValue(mockInstance);

            const result = await script.checkApiConnectivity(mockFrigg, integration);

            expect(result.valid).toBe(true);
            expect(result.issue).toBeNull();
            expect(result.responseTime).toBeGreaterThanOrEqual(0);
        });

        it('should try getCurrentUser if getAuthenticationInfo is not available', async () => {
            const integration = {
                id: 'int-1',
                config: { type: 'hubspot' }
            };

            const mockInstance = {
                primary: {
                    api: {
                        getCurrentUser: jest.fn().mockResolvedValue({ user: 'test' })
                    }
                }
            };

            mockFrigg.instantiate.mockResolvedValue(mockInstance);

            const result = await script.checkApiConnectivity(mockFrigg, integration);

            expect(result.valid).toBe(true);
            expect(mockInstance.primary.api.getCurrentUser).toHaveBeenCalled();
        });

        it('should return note when no health check endpoint is available', async () => {
            const integration = {
                id: 'int-1',
                config: { type: 'hubspot' }
            };

            const mockInstance = {
                primary: {
                    api: {} // No health check methods
                }
            };

            mockFrigg.instantiate.mockResolvedValue(mockInstance);

            const result = await script.checkApiConnectivity(mockFrigg, integration);

            expect(result.valid).toBe(true);
            expect(result.issue).toBeNull();
            expect(result.note).toBe('No health check endpoint available');
        });

        it('should return invalid for API failures', async () => {
            const integration = {
                id: 'int-1',
                config: { type: 'hubspot' }
            };

            const mockInstance = {
                primary: {
                    api: {
                        getAuthenticationInfo: jest.fn().mockRejectedValue(new Error('Network error'))
                    }
                }
            };

            mockFrigg.instantiate.mockResolvedValue(mockInstance);

            const result = await script.checkApiConnectivity(mockFrigg, integration);

            expect(result.valid).toBe(false);
            expect(result.issue).toContain('API connectivity failed');
            expect(result.issue).toContain('Network error');
        });
    });
});
