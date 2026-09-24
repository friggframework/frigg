/**
 * Tests for CloudProviderFactory
 * 
 * Verifies provider instantiation, error handling, and factory patterns
 */

const { CloudProviderFactory } = require('./provider-factory');
const { AWSProviderAdapter } = require('./aws-provider-adapter');

describe('CloudProviderFactory', () => {
    describe('create()', () => {
        it('should create AWS provider when provider is "aws"', () => {
            const provider = CloudProviderFactory.create('aws', 'us-east-1');

            expect(provider).toBeInstanceOf(AWSProviderAdapter);
            expect(provider.getName()).toBe('aws');
            expect(provider.region).toBe('us-east-1');
        });

        it('should default to AWS provider when no provider specified', () => {
            const provider = CloudProviderFactory.create(null, 'us-west-2');

            expect(provider).toBeInstanceOf(AWSProviderAdapter);
            expect(provider.region).toBe('us-west-2');
        });

        it('should be case-insensitive for provider names', () => {
            const provider = CloudProviderFactory.create('AWS', 'eu-west-1');

            expect(provider).toBeInstanceOf(AWSProviderAdapter);
        });

        it('should throw error for GCP (not yet implemented)', () => {
            expect(() => {
                CloudProviderFactory.create('gcp', 'us-central1');
            }).toThrow('GCP provider not yet implemented');
        });

        it('should throw error for Azure (not yet implemented)', () => {
            expect(() => {
                CloudProviderFactory.create('azure', 'eastus');
            }).toThrow('Azure provider not yet implemented');
        });

        it('should handle "google" alias for GCP', () => {
            expect(() => {
                CloudProviderFactory.create('google', 'us-central1');
            }).toThrow('GCP provider not yet implemented');
        });

        it('should handle "microsoft" alias for Azure', () => {
            expect(() => {
                CloudProviderFactory.create('microsoft', 'eastus');
            }).toThrow('Azure provider not yet implemented');
        });

        it('should throw error for unknown provider', () => {
            expect(() => {
                CloudProviderFactory.create('unknown-cloud', 'region-1');
            }).toThrow('Unknown cloud provider: "unknown-cloud"');
        });

        it('should pass credentials to provider', () => {
            const credentials = {
                accessKeyId: 'test-key',
                secretAccessKey: 'test-secret',
            };

            const provider = CloudProviderFactory.create('aws', 'us-east-1', credentials);

            expect(provider.credentials).toEqual(credentials);
        });
    });

    describe('getSupportedProviders()', () => {
        it('should return list of supported providers', () => {
            const providers = CloudProviderFactory.getSupportedProviders();

            expect(Array.isArray(providers)).toBe(true);
            expect(providers.length).toBeGreaterThanOrEqual(3);
        });

        it('should include AWS as available', () => {
            const providers = CloudProviderFactory.getSupportedProviders();
            const aws = providers.find(p => p.name === 'aws');

            expect(aws).toBeDefined();
            expect(aws.status).toBe('available');
            expect(aws.displayName).toBe('Amazon Web Services');
        });

        it('should include GCP as planned', () => {
            const providers = CloudProviderFactory.getSupportedProviders();
            const gcp = providers.find(p => p.name === 'gcp');

            expect(gcp).toBeDefined();
            expect(gcp.status).toBe('planned');
            expect(gcp.displayName).toBe('Google Cloud Platform');
        });

        it('should include Azure as planned', () => {
            const providers = CloudProviderFactory.getSupportedProviders();
            const azure = providers.find(p => p.name === 'azure');

            expect(azure).toBeDefined();
            expect(azure.status).toBe('planned');
            expect(azure.displayName).toBe('Microsoft Azure');
        });
    });

    describe('isSupported()', () => {
        it('should return true for aws', () => {
            expect(CloudProviderFactory.isSupported('aws')).toBe(true);
        });

        it('should return true for gcp', () => {
            expect(CloudProviderFactory.isSupported('gcp')).toBe(true);
        });

        it('should return true for azure', () => {
            expect(CloudProviderFactory.isSupported('azure')).toBe(true);
        });

        it('should return true for google (gcp alias)', () => {
            expect(CloudProviderFactory.isSupported('google')).toBe(true);
        });

        it('should return true for microsoft (azure alias)', () => {
            expect(CloudProviderFactory.isSupported('microsoft')).toBe(true);
        });

        it('should return false for unknown provider', () => {
            expect(CloudProviderFactory.isSupported('unknown')).toBe(false);
        });

        it('should be case-insensitive', () => {
            expect(CloudProviderFactory.isSupported('AWS')).toBe(true);
            expect(CloudProviderFactory.isSupported('GCP')).toBe(true);
        });

        it('should handle null/undefined gracefully', () => {
            expect(CloudProviderFactory.isSupported(null)).toBe(false);
            expect(CloudProviderFactory.isSupported(undefined)).toBe(false);
        });
    });

    describe('isAvailable()', () => {
        it('should return true only for aws', () => {
            expect(CloudProviderFactory.isAvailable('aws')).toBe(true);
        });

        it('should return false for gcp (not yet implemented)', () => {
            expect(CloudProviderFactory.isAvailable('gcp')).toBe(false);
        });

        it('should return false for azure (not yet implemented)', () => {
            expect(CloudProviderFactory.isAvailable('azure')).toBe(false);
        });

        it('should return false for unknown provider', () => {
            expect(CloudProviderFactory.isAvailable('unknown')).toBe(false);
        });

        it('should be case-insensitive', () => {
            expect(CloudProviderFactory.isAvailable('AWS')).toBe(true);
            expect(CloudProviderFactory.isAvailable('GCP')).toBe(false);
        });
    });
});

