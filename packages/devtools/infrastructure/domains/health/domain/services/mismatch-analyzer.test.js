/**
 * Tests for MismatchAnalyzer Domain Service
 */

const MismatchAnalyzer = require('./mismatch-analyzer');
const PropertyMutability = require('../value-objects/property-mutability');

describe('MismatchAnalyzer', () => {
    let analyzer;

    beforeEach(() => {
        analyzer = new MismatchAnalyzer();
    });

    describe('primitive value comparison', () => {
        it('should detect no mismatch for identical strings', () => {
            const mismatches = analyzer.analyze({
                expected: { name: 'my-vpc' },
                actual: { name: 'my-vpc' },
                propertyMutability: { name: PropertyMutability.MUTABLE },
            });

            expect(mismatches).toHaveLength(0);
        });

        it('should detect mismatch for different strings', () => {
            const mismatches = analyzer.analyze({
                expected: { name: 'my-vpc-v1' },
                actual: { name: 'my-vpc-v2' },
                propertyMutability: { name: PropertyMutability.MUTABLE },
            });

            expect(mismatches).toHaveLength(1);
            expect(mismatches[0].propertyPath).toBe('name');
            expect(mismatches[0].expectedValue).toBe('my-vpc-v1');
            expect(mismatches[0].actualValue).toBe('my-vpc-v2');
            expect(mismatches[0].mutability.value).toBe('MUTABLE');
        });

        it('should detect mismatch for different numbers', () => {
            const mismatches = analyzer.analyze({
                expected: { maxSize: 10 },
                actual: { maxSize: 20 },
                propertyMutability: { maxSize: PropertyMutability.MUTABLE },
            });

            expect(mismatches).toHaveLength(1);
            expect(mismatches[0].propertyPath).toBe('maxSize');
            expect(mismatches[0].expectedValue).toBe(10);
            expect(mismatches[0].actualValue).toBe(20);
        });

        it('should detect mismatch for different booleans', () => {
            const mismatches = analyzer.analyze({
                expected: { enableDnsSupport: true },
                actual: { enableDnsSupport: false },
                propertyMutability: { enableDnsSupport: PropertyMutability.MUTABLE },
            });

            expect(mismatches).toHaveLength(1);
            expect(mismatches[0].propertyPath).toBe('enableDnsSupport');
            expect(mismatches[0].expectedValue).toBe(true);
            expect(mismatches[0].actualValue).toBe(false);
        });
    });

    describe('null and undefined handling', () => {
        it('should detect no mismatch for both null', () => {
            const mismatches = analyzer.analyze({
                expected: { description: null },
                actual: { description: null },
                propertyMutability: { description: PropertyMutability.MUTABLE },
            });

            expect(mismatches).toHaveLength(0);
        });

        it('should detect mismatch for null vs value', () => {
            const mismatches = analyzer.analyze({
                expected: { description: null },
                actual: { description: 'Production VPC' },
                propertyMutability: { description: PropertyMutability.MUTABLE },
            });

            expect(mismatches).toHaveLength(1);
            expect(mismatches[0].propertyPath).toBe('description');
            expect(mismatches[0].expectedValue).toBeNull();
            expect(mismatches[0].actualValue).toBe('Production VPC');
        });

        it('should handle undefined as equivalent to null', () => {
            const mismatches = analyzer.analyze({
                expected: { description: undefined },
                actual: { description: null },
                propertyMutability: { description: PropertyMutability.MUTABLE },
            });

            expect(mismatches).toHaveLength(0);
        });
    });

    describe('nested object comparison', () => {
        it('should detect no mismatch for identical nested objects', () => {
            const mismatches = analyzer.analyze({
                expected: {
                    tags: {
                        Environment: 'production',
                        Team: 'platform',
                    },
                },
                actual: {
                    tags: {
                        Environment: 'production',
                        Team: 'platform',
                    },
                },
                propertyMutability: { tags: PropertyMutability.MUTABLE },
            });

            expect(mismatches).toHaveLength(0);
        });

        it('should detect mismatch in nested object property', () => {
            const mismatches = analyzer.analyze({
                expected: {
                    tags: {
                        Environment: 'production',
                        Team: 'platform',
                    },
                },
                actual: {
                    tags: {
                        Environment: 'staging',
                        Team: 'platform',
                    },
                },
                propertyMutability: { 'tags.Environment': PropertyMutability.MUTABLE },
            });

            expect(mismatches).toHaveLength(1);
            expect(mismatches[0].propertyPath).toBe('tags.Environment');
            expect(mismatches[0].expectedValue).toBe('production');
            expect(mismatches[0].actualValue).toBe('staging');
        });

        it('should detect mismatch when nested property is missing', () => {
            const mismatches = analyzer.analyze({
                expected: {
                    tags: {
                        Environment: 'production',
                        Team: 'platform',
                    },
                },
                actual: {
                    tags: {
                        Environment: 'production',
                    },
                },
                propertyMutability: { 'tags.Team': PropertyMutability.MUTABLE },
            });

            expect(mismatches).toHaveLength(1);
            expect(mismatches[0].propertyPath).toBe('tags.Team');
            expect(mismatches[0].expectedValue).toBe('platform');
            expect(mismatches[0].actualValue).toBeUndefined();
        });

        it('should detect mismatch when nested property is added', () => {
            const mismatches = analyzer.analyze({
                expected: {
                    tags: {
                        Environment: 'production',
                    },
                },
                actual: {
                    tags: {
                        Environment: 'production',
                        Team: 'platform',
                    },
                },
                propertyMutability: { 'tags.Team': PropertyMutability.MUTABLE },
            });

            expect(mismatches).toHaveLength(1);
            expect(mismatches[0].propertyPath).toBe('tags.Team');
            expect(mismatches[0].expectedValue).toBeUndefined();
            expect(mismatches[0].actualValue).toBe('platform');
        });
    });

    describe('array comparison', () => {
        it('should detect no mismatch for identical arrays', () => {
            const mismatches = analyzer.analyze({
                expected: { subnets: ['subnet-1', 'subnet-2'] },
                actual: { subnets: ['subnet-1', 'subnet-2'] },
                propertyMutability: { subnets: PropertyMutability.MUTABLE },
            });

            expect(mismatches).toHaveLength(0);
        });

        it('should detect mismatch for different array values', () => {
            const mismatches = analyzer.analyze({
                expected: { subnets: ['subnet-1', 'subnet-2'] },
                actual: { subnets: ['subnet-1', 'subnet-3'] },
                propertyMutability: { subnets: PropertyMutability.MUTABLE },
            });

            expect(mismatches).toHaveLength(1);
            expect(mismatches[0].propertyPath).toBe('subnets');
            expect(mismatches[0].expectedValue).toEqual(['subnet-1', 'subnet-2']);
            expect(mismatches[0].actualValue).toEqual(['subnet-1', 'subnet-3']);
        });

        it('should detect mismatch for different array lengths', () => {
            const mismatches = analyzer.analyze({
                expected: { subnets: ['subnet-1', 'subnet-2'] },
                actual: { subnets: ['subnet-1'] },
                propertyMutability: { subnets: PropertyMutability.MUTABLE },
            });

            expect(mismatches).toHaveLength(1);
            expect(mismatches[0].propertyPath).toBe('subnets');
            expect(mismatches[0].expectedValue).toEqual(['subnet-1', 'subnet-2']);
            expect(mismatches[0].actualValue).toEqual(['subnet-1']);
        });

        it('should detect mismatch for different array order (order-sensitive)', () => {
            const mismatches = analyzer.analyze({
                expected: { subnets: ['subnet-1', 'subnet-2'] },
                actual: { subnets: ['subnet-2', 'subnet-1'] },
                propertyMutability: { subnets: PropertyMutability.MUTABLE },
            });

            expect(mismatches).toHaveLength(1);
            expect(mismatches[0].propertyPath).toBe('subnets');
        });

        it('should handle arrays of objects', () => {
            const mismatches = analyzer.analyze({
                expected: {
                    tags: [
                        { Key: 'Environment', Value: 'production' },
                        { Key: 'Team', Value: 'platform' },
                    ],
                },
                actual: {
                    tags: [
                        { Key: 'Environment', Value: 'staging' },
                        { Key: 'Team', Value: 'platform' },
                    ],
                },
                propertyMutability: { tags: PropertyMutability.MUTABLE },
            });

            expect(mismatches).toHaveLength(1);
            expect(mismatches[0].propertyPath).toBe('tags');
        });
    });

    describe('type mismatch', () => {
        it('should detect type mismatch (string vs number)', () => {
            const mismatches = analyzer.analyze({
                expected: { port: '8080' },
                actual: { port: 8080 },
                propertyMutability: { port: PropertyMutability.MUTABLE },
            });

            expect(mismatches).toHaveLength(1);
            expect(mismatches[0].propertyPath).toBe('port');
            expect(mismatches[0].expectedValue).toBe('8080');
            expect(mismatches[0].actualValue).toBe(8080);
        });

        it('should detect type mismatch (object vs array)', () => {
            const mismatches = analyzer.analyze({
                expected: { data: {} },
                actual: { data: [] },
                propertyMutability: { data: PropertyMutability.MUTABLE },
            });

            expect(mismatches).toHaveLength(1);
            expect(mismatches[0].propertyPath).toBe('data');
        });
    });

    describe('property mutability', () => {
        it('should use MUTABLE mutability by default', () => {
            const mismatches = analyzer.analyze({
                expected: { name: 'vpc-v1' },
                actual: { name: 'vpc-v2' },
                propertyMutability: {}, // No mutability specified
            });

            expect(mismatches).toHaveLength(1);
            expect(mismatches[0].mutability.value).toBe('MUTABLE');
        });

        it('should apply IMMUTABLE mutability', () => {
            const mismatches = analyzer.analyze({
                expected: { bucketName: 'bucket-v1' },
                actual: { bucketName: 'bucket-v2' },
                propertyMutability: { bucketName: PropertyMutability.IMMUTABLE },
            });

            expect(mismatches).toHaveLength(1);
            expect(mismatches[0].mutability.value).toBe('IMMUTABLE');
        });

        it('should apply CONDITIONAL mutability', () => {
            const mismatches = analyzer.analyze({
                expected: { engineVersion: '13.7' },
                actual: { engineVersion: '13.8' },
                propertyMutability: { engineVersion: PropertyMutability.CONDITIONAL },
            });

            expect(mismatches).toHaveLength(1);
            expect(mismatches[0].mutability.value).toBe('CONDITIONAL');
        });
    });

    describe('multiple mismatches', () => {
        it('should detect multiple mismatches in same object', () => {
            const mismatches = analyzer.analyze({
                expected: {
                    name: 'vpc-v1',
                    cidr: '10.0.0.0/16',
                    enableDnsSupport: true,
                },
                actual: {
                    name: 'vpc-v2',
                    cidr: '10.1.0.0/16',
                    enableDnsSupport: true,
                },
                propertyMutability: {
                    name: PropertyMutability.MUTABLE,
                    cidr: PropertyMutability.IMMUTABLE,
                    enableDnsSupport: PropertyMutability.MUTABLE,
                },
            });

            expect(mismatches).toHaveLength(2);

            const nameMismatch = mismatches.find((m) => m.propertyPath === 'name');
            expect(nameMismatch).toBeDefined();
            expect(nameMismatch.mutability.value).toBe('MUTABLE');

            const cidrMismatch = mismatches.find((m) => m.propertyPath === 'cidr');
            expect(cidrMismatch).toBeDefined();
            expect(cidrMismatch.mutability.value).toBe('IMMUTABLE');
        });
    });

    describe('ignore properties', () => {
        it('should ignore specified properties', () => {
            const mismatches = analyzer.analyze({
                expected: {
                    name: 'my-vpc',
                    lastModified: '2024-01-01',
                },
                actual: {
                    name: 'my-vpc',
                    lastModified: '2024-01-15',
                },
                propertyMutability: { name: PropertyMutability.MUTABLE },
                ignoreProperties: ['lastModified'],
            });

            expect(mismatches).toHaveLength(0);
        });

        it('should ignore nested properties', () => {
            const mismatches = analyzer.analyze({
                expected: {
                    config: {
                        name: 'production',
                        timestamp: '2024-01-01',
                    },
                },
                actual: {
                    config: {
                        name: 'production',
                        timestamp: '2024-01-15',
                    },
                },
                propertyMutability: { 'config.name': PropertyMutability.MUTABLE },
                ignoreProperties: ['config.timestamp'],
            });

            expect(mismatches).toHaveLength(0);
        });
    });

    describe('empty objects', () => {
        it('should detect no mismatch for both empty objects', () => {
            const mismatches = analyzer.analyze({
                expected: {},
                actual: {},
                propertyMutability: {},
            });

            expect(mismatches).toHaveLength(0);
        });

        it('should detect mismatch when expected is empty but actual has properties', () => {
            const mismatches = analyzer.analyze({
                expected: {},
                actual: { name: 'my-vpc' },
                propertyMutability: { name: PropertyMutability.MUTABLE },
            });

            expect(mismatches).toHaveLength(1);
            expect(mismatches[0].propertyPath).toBe('name');
            expect(mismatches[0].expectedValue).toBeUndefined();
            expect(mismatches[0].actualValue).toBe('my-vpc');
        });

        it('should detect mismatch when actual is empty but expected has properties', () => {
            const mismatches = analyzer.analyze({
                expected: { name: 'my-vpc' },
                actual: {},
                propertyMutability: { name: PropertyMutability.MUTABLE },
            });

            expect(mismatches).toHaveLength(1);
            expect(mismatches[0].propertyPath).toBe('name');
            expect(mismatches[0].expectedValue).toBe('my-vpc');
            expect(mismatches[0].actualValue).toBeUndefined();
        });
    });
});
