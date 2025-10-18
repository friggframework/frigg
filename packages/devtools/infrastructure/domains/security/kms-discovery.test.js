/**
 * Tests for KMS Discovery Service
 * 
 * Tests KMS encryption key discovery with mocked cloud provider
 */

const { KmsDiscovery } = require('./kms-discovery');

describe('KmsDiscovery', () => {
    let mockProvider;
    let kmsDiscovery;

    beforeEach(() => {
        mockProvider = {
            discoverKmsKeys: jest.fn(),
            getName: jest.fn().mockReturnValue('aws'),
        };
        kmsDiscovery = new KmsDiscovery(mockProvider);
    });

    describe('discover()', () => {
        it('should delegate to provider and transform results', async () => {
            const mockProviderResponse = {
                keys: [
                    {
                        KeyId: 'key-123',
                        Arn: 'arn:aws:kms:us-east-1:123456:key/key-123',
                        Enabled: true,
                    },
                ],
                aliases: [
                    {
                        AliasName: 'alias/frigg-key',
                        TargetKeyId: 'key-123',
                    },
                ],
                defaultKey: {
                    KeyId: 'key-123',
                    Arn: 'arn:aws:kms:us-east-1:123456:key/key-123',
                    Enabled: true,
                },
            };

            mockProvider.discoverKmsKeys.mockResolvedValue(mockProviderResponse);

            const result = await kmsDiscovery.discover({});

            expect(mockProvider.discoverKmsKeys).toHaveBeenCalledWith({});
            expect(result.kmsKeyId).toBe('arn:aws:kms:us-east-1:123456:key/key-123');
            expect(result.kmsKeyArn).toBe('arn:aws:kms:us-east-1:123456:key/key-123');
            expect(result.defaultKmsKeyId).toBe('arn:aws:kms:us-east-1:123456:key/key-123');
            expect(result.kmsKeyAlias).toBe('alias/frigg-key');
        });

        it('should handle no KMS keys found', async () => {
            mockProvider.discoverKmsKeys.mockResolvedValue({
                keys: [],
                aliases: [],
                defaultKey: null,
            });

            const result = await kmsDiscovery.discover({});

            expect(result.kmsKeyId).toBeNull();
            expect(result.kmsKeyArn).toBeNull();
            expect(result.defaultKmsKeyId).toBeNull();
            expect(result.kmsKeyAlias).toBeNull();
        });

        it('should handle KMS key without alias', async () => {
            mockProvider.discoverKmsKeys.mockResolvedValue({
                keys: [
                    {
                        KeyId: 'key-456',
                        Arn: 'arn:aws:kms:us-east-1:123456:key/key-456',
                        Enabled: true,
                    },
                ],
                aliases: [],
                defaultKey: {
                    KeyId: 'key-456',
                    Arn: 'arn:aws:kms:us-east-1:123456:key/key-456',
                    Enabled: true,
                },
            });

            const result = await kmsDiscovery.discover({});

            expect(result.kmsKeyId).toBe('arn:aws:kms:us-east-1:123456:key/key-456');
            expect(result.kmsKeyAlias).toBeNull();
        });

        it('should pass config to provider', async () => {
            mockProvider.discoverKmsKeys.mockResolvedValue({
                keys: [],
                aliases: [],
                defaultKey: null,
            });

            const config = {
                keyId: 'key-specific',
                keyAlias: 'alias/custom',
                serviceName: 'test-service',
            };

            await kmsDiscovery.discover(config);

            expect(mockProvider.discoverKmsKeys).toHaveBeenCalledWith(config);
        });

        it('should handle discovery errors gracefully', async () => {
            mockProvider.discoverKmsKeys.mockRejectedValue(new Error('KMS API Error'));

            const result = await kmsDiscovery.discover({});

            expect(result.kmsKeyId).toBeNull();
            expect(result.kmsKeyArn).toBeNull();
            expect(result.defaultKmsKeyId).toBeNull();
            expect(result.kmsKeyAlias).toBeNull();
        });

        it('should find alias for discovered key', async () => {
            mockProvider.discoverKmsKeys.mockResolvedValue({
                keys: [
                    {
                        KeyId: 'key-789',
                        Arn: 'arn:aws:kms:eu-west-1:123456:key/key-789',
                        Enabled: true,
                    },
                ],
                aliases: [
                    {
                        AliasName: 'alias/other-key',
                        TargetKeyId: 'key-999',
                    },
                    {
                        AliasName: 'alias/my-key',
                        TargetKeyId: 'key-789',
                    },
                ],
                defaultKey: {
                    KeyId: 'key-789',
                    Arn: 'arn:aws:kms:eu-west-1:123456:key/key-789',
                    Enabled: true,
                },
            });

            const result = await kmsDiscovery.discover({});

            expect(result.kmsKeyAlias).toBe('alias/my-key');
        });

        it('should return all keys and aliases for reference', async () => {
            const mockKeys = [
                { KeyId: 'key-1', Arn: 'arn:1', Enabled: true },
                { KeyId: 'key-2', Arn: 'arn:2', Enabled: true },
            ];
            const mockAliases = [
                { AliasName: 'alias/one', TargetKeyId: 'key-1' },
                { AliasName: 'alias/two', TargetKeyId: 'key-2' },
            ];

            mockProvider.discoverKmsKeys.mockResolvedValue({
                keys: mockKeys,
                aliases: mockAliases,
                defaultKey: mockKeys[0],
            });

            const result = await kmsDiscovery.discover({});

            expect(result.keys).toEqual(mockKeys);
            expect(result.aliases).toEqual(mockAliases);
        });
    });
});

