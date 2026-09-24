/**
 * Tests for Aurora Discovery Service
 * 
 * Tests Aurora/RDS database discovery with mocked cloud provider
 */

const { AuroraDiscovery } = require('./aurora-discovery');

describe('AuroraDiscovery', () => {
    let mockProvider;
    let auroraDiscovery;

    beforeEach(() => {
        mockProvider = {
            discoverDatabase: jest.fn(),
            getName: jest.fn().mockReturnValue('aws'),
        };
        auroraDiscovery = new AuroraDiscovery(mockProvider);
    });

    describe('discover()', () => {
        it('should delegate to provider and transform results', async () => {
            const mockProviderResponse = {
                clusters: [
                    {
                        DBClusterIdentifier: 'aurora-cluster-1',
                        Endpoint: 'aurora-cluster-1.cluster-xyz.us-east-1.rds.amazonaws.com',
                        Port: 5432,
                        Engine: 'aurora-postgresql',
                    },
                ],
                instances: [],
                endpoint: 'aurora-cluster-1.cluster-xyz.us-east-1.rds.amazonaws.com',
                port: 5432,
                engine: 'aurora-postgresql',
            };

            mockProvider.discoverDatabase.mockResolvedValue(mockProviderResponse);

            const result = await auroraDiscovery.discover({});

            expect(mockProvider.discoverDatabase).toHaveBeenCalledWith({});
            expect(result.auroraClusterEndpoint).toBe('aurora-cluster-1.cluster-xyz.us-east-1.rds.amazonaws.com');
            expect(result.databaseEndpoint).toBe('aurora-cluster-1.cluster-xyz.us-east-1.rds.amazonaws.com');
            expect(result.auroraPort).toBe(5432);
            expect(result.databasePort).toBe(5432);
            expect(result.auroraEngine).toBe('aurora-postgresql');
            expect(result.databaseEngine).toBe('aurora-postgresql');
        });

        it('should handle no database found', async () => {
            mockProvider.discoverDatabase.mockResolvedValue({
                clusters: [],
                instances: [],
                endpoint: null,
                port: null,
                engine: null,
            });

            const result = await auroraDiscovery.discover({});

            expect(result.auroraClusterEndpoint).toBeNull();
            expect(result.databaseEndpoint).toBeNull();
            expect(result.auroraPort).toBeNull();
            expect(result.databasePort).toBeNull();
        });

        it('should default to port 5432 if not specified', async () => {
            mockProvider.discoverDatabase.mockResolvedValue({
                clusters: [],
                instances: [],
                endpoint: 'db.example.com',
                port: null,
                engine: 'aurora-postgresql',
            });

            const result = await auroraDiscovery.discover({});

            expect(result.auroraPort).toBe(5432);
            expect(result.databasePort).toBe(5432);
        });

        it('should default to aurora-postgresql engine if not specified', async () => {
            mockProvider.discoverDatabase.mockResolvedValue({
                clusters: [],
                instances: [],
                endpoint: 'db.example.com',
                port: 5432,
                engine: null,
            });

            const result = await auroraDiscovery.discover({});

            expect(result.auroraEngine).toBe('aurora-postgresql');
            expect(result.databaseEngine).toBe('aurora-postgresql');
        });

        it('should handle MySQL Aurora', async () => {
            mockProvider.discoverDatabase.mockResolvedValue({
                clusters: [],
                instances: [],
                endpoint: 'mysql-cluster.example.com',
                port: 3306,
                engine: 'aurora-mysql',
            });

            const result = await auroraDiscovery.discover({});

            expect(result.auroraPort).toBe(3306);
            expect(result.auroraEngine).toBe('aurora-mysql');
        });

        it('should pass config to provider', async () => {
            mockProvider.discoverDatabase.mockResolvedValue({
                clusters: [],
                instances: [],
                endpoint: null,
                port: null,
                engine: null,
            });

            const config = {
                databaseId: 'my-cluster',
                serviceName: 'test-service',
                stage: 'prod',
            };

            await auroraDiscovery.discover(config);

            expect(mockProvider.discoverDatabase).toHaveBeenCalledWith(config);
        });

        it('should handle discovery errors gracefully', async () => {
            mockProvider.discoverDatabase.mockRejectedValue(new Error('RDS API Error'));

            const result = await auroraDiscovery.discover({});

            expect(result.auroraClusterEndpoint).toBeNull();
            expect(result.auroraPort).toBeNull();
            expect(result.auroraEngine).toBeNull();
        });

        it('should preserve cluster and instance lists for reference', async () => {
            const mockClusters = [
                { DBClusterIdentifier: 'cluster-1', Endpoint: 'endpoint-1' },
                { DBClusterIdentifier: 'cluster-2', Endpoint: 'endpoint-2' },
            ];
            const mockInstances = [
                { DBInstanceIdentifier: 'instance-1' },
            ];

            mockProvider.discoverDatabase.mockResolvedValue({
                clusters: mockClusters,
                instances: mockInstances,
                endpoint: 'endpoint-1',
                port: 5432,
                engine: 'aurora-postgresql',
            });

            const result = await auroraDiscovery.discover({});

            expect(result.clusters).toEqual(mockClusters);
            expect(result.instances).toEqual(mockInstances);
        });

        it('should handle RDS instances (non-Aurora)', async () => {
            mockProvider.discoverDatabase.mockResolvedValue({
                clusters: [],
                instances: [
                    {
                        DBInstanceIdentifier: 'rds-instance',
                        Endpoint: { Address: 'rds.example.com', Port: 5432 },
                        Engine: 'postgres',
                    },
                ],
                endpoint: 'rds.example.com',
                port: 5432,
                engine: 'postgres',
            });

            const result = await auroraDiscovery.discover({});

            expect(result.databaseEndpoint).toBe('rds.example.com');
            expect(result.databaseEngine).toBe('postgres');
        });
    });
});

