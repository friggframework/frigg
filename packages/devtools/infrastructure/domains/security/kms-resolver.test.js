const { KmsResourceResolver } = require('./kms-resolver');
const { ResourceOwnership, createEmptyDiscoveryResult } = require('../shared/types');

describe('KmsResourceResolver', () => {
    let resolver;

    beforeEach(() => {
        resolver = new KmsResourceResolver();
    });

    describe('resolveKey', () => {
        describe('Explicit ownership intent', () => {
            it('should respect ownership.key=stack when specified', () => {
                const appDefinition = {
                    encryption: {
                        ownership: { key: 'stack' }
                    }
                };
                const discovery = createEmptyDiscoveryResult();

                const decision = resolver.resolveKey(appDefinition, discovery);

                expect(decision.ownership).toBe(ResourceOwnership.STACK);
                expect(decision.physicalId).toBeNull();
                expect(decision.reason).toContain('Will create FriggKMSKey in stack');
            });

            it('should respect ownership.key=external when KMS key discovered', () => {
                const appDefinition = {
                    encryption: {
                        ownership: { key: 'external' }
                    }
                };
                const discovery = createEmptyDiscoveryResult();
                discovery.external.push({
                    physicalId: 'arn:aws:kms:us-east-1:123456789012:key/abcd-1234',
                    resourceType: 'AWS::KMS::Key',
                    source: 'aws-discovery'
                });

                const decision = resolver.resolveKey(appDefinition, discovery);

                expect(decision.ownership).toBe(ResourceOwnership.EXTERNAL);
                expect(decision.physicalId).toBe('arn:aws:kms:us-east-1:123456789012:key/abcd-1234');
                expect(decision.reason).toContain('external');
            });

            it('should error when ownership.key=external but no KMS key discovered', () => {
                const appDefinition = {
                    encryption: {
                        ownership: { key: 'external' }
                    }
                };
                const discovery = createEmptyDiscoveryResult();

                expect(() => resolver.resolveKey(appDefinition, discovery))
                    .toThrow('ownership.key=external but no KMS key discovered');
            });
        });

        describe('Auto resolution (ownership.key=auto)', () => {
            it('should use stack KMS key when found in CloudFormation', () => {
                const appDefinition = {
                    encryption: {
                        ownership: { key: 'auto' }
                    }
                };
                const discovery = createEmptyDiscoveryResult();
                discovery.fromCloudFormation = true;
                discovery.stackManaged.push({
                    logicalId: 'FriggKMSKey',
                    physicalId: 'arn:aws:kms:us-east-1:123456789012:key/stack-key',
                    resourceType: 'AWS::KMS::Key'
                });

                const decision = resolver.resolveKey(appDefinition, discovery);

                expect(decision.ownership).toBe(ResourceOwnership.STACK);
                expect(decision.physicalId).toBe('arn:aws:kms:us-east-1:123456789012:key/stack-key');
                expect(decision.reason).toContain('Found FriggKMSKey in CloudFormation stack');
            });

            it('should use external KMS key when found via discovery', () => {
                const appDefinition = {
                    encryption: {
                        ownership: { key: 'auto' }
                    }
                };
                const discovery = createEmptyDiscoveryResult();
                discovery.external.push({
                    physicalId: 'arn:aws:kms:us-east-1:123456789012:key/external-key',
                    resourceType: 'AWS::KMS::Key',
                    source: 'aws-discovery'
                });

                const decision = resolver.resolveKey(appDefinition, discovery);

                expect(decision.ownership).toBe(ResourceOwnership.EXTERNAL);
                expect(decision.physicalId).toBe('arn:aws:kms:us-east-1:123456789012:key/external-key');
                expect(decision.reason).toContain('Found external KMS key via discovery');
            });

            it('should create new KMS key when none found', () => {
                const appDefinition = {
                    encryption: {
                        ownership: { key: 'auto' }
                    }
                };
                const discovery = createEmptyDiscoveryResult();

                const decision = resolver.resolveKey(appDefinition, discovery);

                expect(decision.ownership).toBe(ResourceOwnership.STACK);
                expect(decision.physicalId).toBeNull();
                expect(decision.reason).toContain('No existing KMS key - will create in stack');
            });
        });

        describe('Default behavior (no ownership specified)', () => {
            it('should default to auto resolution', () => {
                const appDefinition = {
                    encryption: {
                        fieldLevelEncryptionMethod: 'kms'
                        // No ownership specified
                    }
                };
                const discovery = createEmptyDiscoveryResult();

                const decision = resolver.resolveKey(appDefinition, discovery);

                expect(decision.ownership).toBe(ResourceOwnership.STACK);
                expect(decision.reason).toContain('No existing KMS key - will create in stack');
            });
        });
    });

    describe('resolveAll', () => {
        it('should return decisions for all KMS resources', () => {
            const appDefinition = {
                encryption: {
                    fieldLevelEncryptionMethod: 'kms'
                }
            };
            const discovery = createEmptyDiscoveryResult();

            const decisions = resolver.resolveAll(appDefinition, discovery);

            expect(decisions).toHaveProperty('key');
            expect(decisions.key.ownership).toBe(ResourceOwnership.STACK);
        });
    });

    describe('Real-world scenarios', () => {
        it('should handle managementMode=managed scenario (create KMS)', () => {
            // In managed mode, we want to create KMS in stack
            const appDefinition = {
                managementMode: 'managed',
                encryption: {
                    fieldLevelEncryptionMethod: 'kms',
                    ownership: { key: 'stack' }
                }
            };
            const discovery = createEmptyDiscoveryResult();

            const decision = resolver.resolveKey(appDefinition, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.STACK);
            expect(decision.physicalId).toBeNull();
        });

        it('should handle existing stack KMS key (reuse)', () => {
            // Stack already has KMS from previous deployment
            const appDefinition = {
                encryption: {
                    fieldLevelEncryptionMethod: 'kms',
                    ownership: { key: 'auto' }
                }
            };
            const discovery = createEmptyDiscoveryResult();
            discovery.fromCloudFormation = true;
            discovery.stackManaged.push({
                logicalId: 'FriggKMSKey',
                physicalId: 'arn:aws:kms:us-east-1:123456789012:key/existing-stack-key',
                resourceType: 'AWS::KMS::Key'
            });

            const decision = resolver.resolveKey(appDefinition, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.STACK);
            expect(decision.physicalId).toBe('arn:aws:kms:us-east-1:123456789012:key/existing-stack-key');
        });

        it('should handle shared KMS key scenario (vpcIsolation=shared)', () => {
            // Using shared infrastructure KMS key
            const appDefinition = {
                managementMode: 'managed',
                vpcIsolation: 'shared',
                encryption: {
                    fieldLevelEncryptionMethod: 'kms',
                    ownership: { key: 'auto' }
                }
            };
            const discovery = createEmptyDiscoveryResult();
            discovery.external.push({
                physicalId: 'arn:aws:kms:us-east-1:123456789012:key/shared-key',
                resourceType: 'AWS::KMS::Key',
                source: 'aws-discovery'
            });

            const decision = resolver.resolveKey(appDefinition, discovery);

            expect(decision.ownership).toBe(ResourceOwnership.EXTERNAL);
            expect(decision.physicalId).toBe('arn:aws:kms:us-east-1:123456789012:key/shared-key');
        });
    });
});
