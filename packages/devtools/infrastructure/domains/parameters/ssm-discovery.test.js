/**
 * Tests for SSM Discovery Service
 * 
 * Tests SSM Parameter Store and Secrets Manager discovery with mocked provider
 */

const { SsmDiscovery } = require('./ssm-discovery');

describe('SsmDiscovery', () => {
    let mockProvider;
    let ssmDiscovery;

    beforeEach(() => {
        mockProvider = {
            discoverParameters: jest.fn(),
            getName: jest.fn().mockReturnValue('aws'),
        };
        ssmDiscovery = new SsmDiscovery(mockProvider);
    });

    describe('discover()', () => {
        it('should delegate to provider and transform results', async () => {
            const mockProviderResponse = {
                parameters: [
                    {
                        Name: '/my-service/prod/API_KEY',
                        Value: 'encrypted-value',
                        Type: 'SecureString',
                    },
                    {
                        Name: '/my-service/prod/DATABASE_URL',
                        Value: 'postgres://...',
                        Type: 'SecureString',
                    },
                ],
                secrets: [
                    {
                        Name: 'my-service/database-credentials',
                        ARN: 'arn:aws:secretsmanager:us-east-1:123456:secret:my-service/database-credentials',
                    },
                ],
            };

            mockProvider.discoverParameters.mockResolvedValue(mockProviderResponse);

            const result = await ssmDiscovery.discover({
                serviceName: 'my-service',
                stage: 'prod',
            });

            expect(mockProvider.discoverParameters).toHaveBeenCalled();
            expect(result.parameters).toHaveLength(2);
            expect(result.secrets).toHaveLength(1);
            expect(result.parameterPath).toBe('/my-service/prod');
        });

        it('should build parameter path from serviceName and stage', async () => {
            mockProvider.discoverParameters.mockResolvedValue({
                parameters: [],
                secrets: [],
            });

            await ssmDiscovery.discover({
                serviceName: 'test-app',
                stage: 'dev',
            });

            expect(mockProvider.discoverParameters).toHaveBeenCalledWith(
                expect.objectContaining({
                    parameterPath: '/test-app/dev',
                    includeSecrets: true,
                })
            );
        });

        it('should use provided parameterPath if specified', async () => {
            mockProvider.discoverParameters.mockResolvedValue({
                parameters: [],
                secrets: [],
            });

            await ssmDiscovery.discover({
                parameterPath: '/custom/path',
            });

            expect(mockProvider.discoverParameters).toHaveBeenCalledWith(
                expect.objectContaining({
                    parameterPath: '/custom/path',
                })
            );
        });

        it('should handle no parameters found', async () => {
            mockProvider.discoverParameters.mockResolvedValue({
                parameters: [],
                secrets: [],
            });

            const result = await ssmDiscovery.discover({});

            expect(result.parameters).toEqual([]);
            expect(result.secrets).toEqual([]);
        });

        it('should find database secret if exists', async () => {
            mockProvider.discoverParameters.mockResolvedValue({
                parameters: [],
                secrets: [
                    {
                        Name: 'my-app/config',
                        ARN: 'arn:aws:secretsmanager:us-east-1:123456:secret:my-app/config',
                    },
                    {
                        Name: 'my-app/database-secret',
                        ARN: 'arn:aws:secretsmanager:us-east-1:123456:secret:my-app/database-secret',
                    },
                ],
            });

            const result = await ssmDiscovery.discover({});

            expect(result.databaseSecretArn).toBe('arn:aws:secretsmanager:us-east-1:123456:secret:my-app/database-secret');
            expect(result.databaseSecretName).toBe('my-app/database-secret');
        });

        it('should find RDS secret if exists', async () => {
            mockProvider.discoverParameters.mockResolvedValue({
                parameters: [],
                secrets: [
                    {
                        Name: 'rds/postgres/credentials',
                        ARN: 'arn:aws:secretsmanager:us-east-1:123456:secret:rds/postgres/credentials',
                    },
                ],
            });

            const result = await ssmDiscovery.discover({});

            expect(result.databaseSecretArn).toBe('arn:aws:secretsmanager:us-east-1:123456:secret:rds/postgres/credentials');
            expect(result.databaseSecretName).toBe('rds/postgres/credentials');
        });

        it('should handle includeSecrets flag', async () => {
            mockProvider.discoverParameters.mockResolvedValue({
                parameters: [],
                secrets: [],
            });

            await ssmDiscovery.discover({
                includeSecrets: false,
            });

            expect(mockProvider.discoverParameters).toHaveBeenCalledWith(
                expect.objectContaining({
                    includeSecrets: false,
                })
            );
        });

        it('should default includeSecrets to true', async () => {
            mockProvider.discoverParameters.mockResolvedValue({
                parameters: [],
                secrets: [],
            });

            await ssmDiscovery.discover({});

            expect(mockProvider.discoverParameters).toHaveBeenCalledWith(
                expect.objectContaining({
                    includeSecrets: true,
                })
            );
        });

        it('should handle discovery errors gracefully', async () => {
            mockProvider.discoverParameters.mockRejectedValue(new Error('SSM API Error'));

            const result = await ssmDiscovery.discover({});

            expect(result.parameters).toEqual([]);
            expect(result.secrets).toEqual([]);
        });

        it('should preserve parameterPath in result', async () => {
            mockProvider.discoverParameters.mockResolvedValue({
                parameters: [],
                secrets: [],
            });

            const result = await ssmDiscovery.discover({
                parameterPath: '/my-service/staging',
            });

            expect(result.parameterPath).toBe('/my-service/staging');
        });

        it('should handle null/undefined parameters and secrets', async () => {
            mockProvider.discoverParameters.mockResolvedValue({
                parameters: null,
                secrets: undefined,
            });

            const result = await ssmDiscovery.discover({});

            expect(result.parameters).toEqual([]);
            expect(result.secrets).toEqual([]);
        });
    });
});

