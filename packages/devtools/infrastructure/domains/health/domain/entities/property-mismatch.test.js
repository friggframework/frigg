/**
 * Tests for PropertyMismatch Entity
 */

const PropertyMismatch = require('./property-mismatch');
const PropertyMutability = require('../value-objects/property-mutability');

describe('PropertyMismatch', () => {
    describe('constructor', () => {
        it('should create property mismatch with all fields', () => {
            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.BucketName',
                expectedValue: 'my-app-prod-bucket',
                actualValue: 'my-app-dev-bucket',
                mutability: PropertyMutability.IMMUTABLE,
            });

            expect(mismatch.propertyPath).toBe('Properties.BucketName');
            expect(mismatch.expectedValue).toBe('my-app-prod-bucket');
            expect(mismatch.actualValue).toBe('my-app-dev-bucket');
            expect(mismatch.mutability.value).toBe('IMMUTABLE');
        });

        it('should require propertyPath', () => {
            expect(() => {
                new PropertyMismatch({
                    expectedValue: 'value1',
                    actualValue: 'value2',
                    mutability: PropertyMutability.MUTABLE,
                });
            }).toThrow('propertyPath is required');
        });

        it('should require expectedValue', () => {
            expect(() => {
                new PropertyMismatch({
                    propertyPath: 'Properties.Name',
                    actualValue: 'value2',
                    mutability: PropertyMutability.MUTABLE,
                });
            }).toThrow('expectedValue is required');
        });

        it('should require actualValue', () => {
            expect(() => {
                new PropertyMismatch({
                    propertyPath: 'Properties.Name',
                    expectedValue: 'value1',
                    mutability: PropertyMutability.MUTABLE,
                });
            }).toThrow('actualValue is required');
        });

        it('should require mutability', () => {
            expect(() => {
                new PropertyMismatch({
                    propertyPath: 'Properties.Name',
                    expectedValue: 'value1',
                    actualValue: 'value2',
                });
            }).toThrow('mutability is required');
        });

        it('should accept null as expectedValue', () => {
            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.Tags',
                expectedValue: null,
                actualValue: ['tag1', 'tag2'],
                mutability: PropertyMutability.MUTABLE,
            });

            expect(mismatch.expectedValue).toBeNull();
        });

        it('should accept null as actualValue', () => {
            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.Tags',
                expectedValue: ['tag1', 'tag2'],
                actualValue: null,
                mutability: PropertyMutability.MUTABLE,
            });

            expect(mismatch.actualValue).toBeNull();
        });
    });

    describe('requiresReplacement', () => {
        it('should return true for immutable property', () => {
            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.BucketName',
                expectedValue: 'bucket1',
                actualValue: 'bucket2',
                mutability: PropertyMutability.IMMUTABLE,
            });

            expect(mismatch.requiresReplacement()).toBe(true);
        });

        it('should return false for mutable property', () => {
            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.Tags',
                expectedValue: ['tag1'],
                actualValue: ['tag2'],
                mutability: PropertyMutability.MUTABLE,
            });

            expect(mismatch.requiresReplacement()).toBe(false);
        });

        it('should return false for conditional property', () => {
            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.EngineVersion',
                expectedValue: '5.7',
                actualValue: '5.6',
                mutability: PropertyMutability.CONDITIONAL,
            });

            expect(mismatch.requiresReplacement()).toBe(false);
        });
    });

    describe('canAutoFix', () => {
        it('should return true for mutable property', () => {
            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.Tags',
                expectedValue: ['tag1'],
                actualValue: ['tag2'],
                mutability: PropertyMutability.MUTABLE,
            });

            expect(mismatch.canAutoFix()).toBe(true);
        });

        it('should return false for immutable property', () => {
            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.BucketName',
                expectedValue: 'bucket1',
                actualValue: 'bucket2',
                mutability: PropertyMutability.IMMUTABLE,
            });

            expect(mismatch.canAutoFix()).toBe(false);
        });

        it('should return false for conditional property', () => {
            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.EngineVersion',
                expectedValue: '5.7',
                actualValue: '5.6',
                mutability: PropertyMutability.CONDITIONAL,
            });

            expect(mismatch.canAutoFix()).toBe(false);
        });
    });

    describe('getSeverity', () => {
        it('should return critical for immutable property mismatch', () => {
            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.BucketName',
                expectedValue: 'bucket1',
                actualValue: 'bucket2',
                mutability: PropertyMutability.IMMUTABLE,
            });

            expect(mismatch.getSeverity()).toBe('critical');
        });

        it('should return warning for mutable property mismatch', () => {
            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.Tags',
                expectedValue: ['tag1'],
                actualValue: ['tag2'],
                mutability: PropertyMutability.MUTABLE,
            });

            expect(mismatch.getSeverity()).toBe('warning');
        });

        it('should return warning for conditional property mismatch', () => {
            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.EngineVersion',
                expectedValue: '5.7',
                actualValue: '5.6',
                mutability: PropertyMutability.CONDITIONAL,
            });

            expect(mismatch.getSeverity()).toBe('warning');
        });
    });

    describe('toString', () => {
        it('should return string representation', () => {
            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.BucketName',
                expectedValue: 'bucket1',
                actualValue: 'bucket2',
                mutability: PropertyMutability.IMMUTABLE,
            });

            expect(mismatch.toString()).toBe(
                'PropertyMismatch: Properties.BucketName (expected: bucket1, actual: bucket2, mutability: IMMUTABLE)'
            );
        });

        it('should handle null expected value', () => {
            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.Tags',
                expectedValue: null,
                actualValue: ['tag1'],
                mutability: PropertyMutability.MUTABLE,
            });

            expect(mismatch.toString()).toContain('expected: null');
        });

        it('should handle null actual value', () => {
            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.Tags',
                expectedValue: ['tag1'],
                actualValue: null,
                mutability: PropertyMutability.MUTABLE,
            });

            expect(mismatch.toString()).toContain('actual: null');
        });
    });

    describe('toJSON', () => {
        it('should serialize to JSON', () => {
            const mismatch = new PropertyMismatch({
                propertyPath: 'Properties.BucketName',
                expectedValue: 'bucket1',
                actualValue: 'bucket2',
                mutability: PropertyMutability.IMMUTABLE,
            });

            const json = mismatch.toJSON();

            expect(json).toEqual({
                propertyPath: 'Properties.BucketName',
                expectedValue: 'bucket1',
                actualValue: 'bucket2',
                mutability: 'IMMUTABLE',
                severity: 'critical',
                canAutoFix: false,
                requiresReplacement: true,
            });
        });
    });
});
