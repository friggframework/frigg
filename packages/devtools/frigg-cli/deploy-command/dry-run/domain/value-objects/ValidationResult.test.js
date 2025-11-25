/**
 * Tests for ValidationResult Value Object
 */

const { ValidationResult } = require('./ValidationResult');

describe('ValidationResult', () => {
    describe('constructor', () => {
        it('should create validation result with valid true', () => {
            // Arrange & Act
            const result = new ValidationResult({
                valid: true,
                errors: [],
                warnings: [],
            });

            // Assert
            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
            expect(result.warnings).toEqual([]);
        });

        it('should create validation result with valid false', () => {
            // Arrange & Act
            const result = new ValidationResult({
                valid: false,
                errors: ['Error 1'],
                warnings: ['Warning 1'],
            });

            // Assert
            expect(result.valid).toBe(false);
            expect(result.errors).toEqual(['Error 1']);
            expect(result.warnings).toEqual(['Warning 1']);
        });

        it('should use default empty arrays for errors and warnings', () => {
            // Arrange & Act
            const result = new ValidationResult({ valid: true });

            // Assert
            expect(result.errors).toEqual([]);
            expect(result.warnings).toEqual([]);
        });

        it('should use default empty object for metadata', () => {
            // Arrange & Act
            const result = new ValidationResult({ valid: true });

            // Assert
            expect(result.metadata).toEqual({});
        });

        it('should store metadata', () => {
            // Arrange
            const metadata = { stackName: 'test-stack', region: 'us-east-1' };

            // Act
            const result = new ValidationResult({
                valid: true,
                metadata,
            });

            // Assert
            expect(result.metadata).toEqual(metadata);
        });

        it('should store multiple errors', () => {
            // Arrange
            const errors = ['Error 1', 'Error 2', 'Error 3'];

            // Act
            const result = new ValidationResult({
                valid: false,
                errors,
            });

            // Assert
            expect(result.errors).toEqual(errors);
        });

        it('should store multiple warnings', () => {
            // Arrange
            const warnings = ['Warning 1', 'Warning 2'];

            // Act
            const result = new ValidationResult({
                valid: true,
                warnings,
            });

            // Assert
            expect(result.warnings).toEqual(warnings);
        });

        it('should reject non-boolean valid value', () => {
            // Arrange & Act & Assert
            expect(() => {
                new ValidationResult({ valid: 'true' });
            }).toThrow('valid must be a boolean');
        });

        it('should reject undefined valid value', () => {
            // Arrange & Act & Assert
            expect(() => {
                new ValidationResult({ valid: undefined });
            }).toThrow('valid must be a boolean');
        });

        it('should reject null valid value', () => {
            // Arrange & Act & Assert
            expect(() => {
                new ValidationResult({ valid: null });
            }).toThrow('valid must be a boolean');
        });

        it('should reject numeric valid value', () => {
            // Arrange & Act & Assert
            expect(() => {
                new ValidationResult({ valid: 1 });
            }).toThrow('valid must be a boolean');
        });
    });

    describe('hasErrors', () => {
        it('should return true when errors array has items', () => {
            // Arrange
            const result = new ValidationResult({
                valid: false,
                errors: ['Error 1'],
            });

            // Act & Assert
            expect(result.hasErrors()).toBe(true);
        });

        it('should return true when errors array has multiple items', () => {
            // Arrange
            const result = new ValidationResult({
                valid: false,
                errors: ['Error 1', 'Error 2', 'Error 3'],
            });

            // Act & Assert
            expect(result.hasErrors()).toBe(true);
        });

        it('should return false when errors array is empty', () => {
            // Arrange
            const result = new ValidationResult({
                valid: true,
                errors: [],
            });

            // Act & Assert
            expect(result.hasErrors()).toBe(false);
        });

        it('should return false when errors is default', () => {
            // Arrange
            const result = new ValidationResult({ valid: true });

            // Act & Assert
            expect(result.hasErrors()).toBe(false);
        });
    });

    describe('hasWarnings', () => {
        it('should return true when warnings array has items', () => {
            // Arrange
            const result = new ValidationResult({
                valid: true,
                warnings: ['Warning 1'],
            });

            // Act & Assert
            expect(result.hasWarnings()).toBe(true);
        });

        it('should return true when warnings array has multiple items', () => {
            // Arrange
            const result = new ValidationResult({
                valid: true,
                warnings: ['Warning 1', 'Warning 2'],
            });

            // Act & Assert
            expect(result.hasWarnings()).toBe(true);
        });

        it('should return false when warnings array is empty', () => {
            // Arrange
            const result = new ValidationResult({
                valid: true,
                warnings: [],
            });

            // Act & Assert
            expect(result.hasWarnings()).toBe(false);
        });

        it('should return false when warnings is default', () => {
            // Arrange
            const result = new ValidationResult({ valid: true });

            // Act & Assert
            expect(result.hasWarnings()).toBe(false);
        });
    });

    describe('toObject', () => {
        it('should return object representation with all properties', () => {
            // Arrange
            const result = new ValidationResult({
                valid: true,
                errors: [],
                warnings: ['Warning 1'],
                metadata: { key: 'value' },
            });

            // Act
            const obj = result.toObject();

            // Assert
            expect(obj).toEqual({
                valid: true,
                errors: [],
                warnings: ['Warning 1'],
                metadata: { key: 'value' },
            });
        });

        it('should return object with errors', () => {
            // Arrange
            const result = new ValidationResult({
                valid: false,
                errors: ['Error 1', 'Error 2'],
            });

            // Act
            const obj = result.toObject();

            // Assert
            expect(obj.errors).toEqual(['Error 1', 'Error 2']);
        });

        it('should return new arrays for errors and warnings', () => {
            // Arrange
            const result = new ValidationResult({
                valid: true,
                errors: ['Error 1'],
                warnings: ['Warning 1'],
            });

            // Act
            const obj = result.toObject();

            // Assert
            expect(obj.errors).not.toBe(result.errors);
            expect(obj.warnings).not.toBe(result.warnings);
        });

        it('should return new object for metadata', () => {
            // Arrange
            const metadata = { key: 'value' };
            const result = new ValidationResult({
                valid: true,
                metadata,
            });

            // Act
            const obj = result.toObject();

            // Assert
            expect(obj.metadata).not.toBe(result.metadata);
            expect(obj.metadata).toEqual(metadata);
        });
    });

    describe('static factory methods', () => {
        describe('success', () => {
            it('should create successful validation result', () => {
                // Arrange & Act
                const result = ValidationResult.success();

                // Assert
                expect(result.valid).toBe(true);
                expect(result.errors).toEqual([]);
                expect(result.warnings).toEqual([]);
                expect(result.metadata).toEqual({});
            });

            it('should create successful validation result with metadata', () => {
                // Arrange
                const metadata = { stackName: 'test-stack' };

                // Act
                const result = ValidationResult.success(metadata);

                // Assert
                expect(result.valid).toBe(true);
                expect(result.metadata).toEqual(metadata);
            });

            it('should not have errors', () => {
                // Arrange & Act
                const result = ValidationResult.success();

                // Assert
                expect(result.hasErrors()).toBe(false);
            });

            it('should not have warnings', () => {
                // Arrange & Act
                const result = ValidationResult.success();

                // Assert
                expect(result.hasWarnings()).toBe(false);
            });
        });

        describe('failure', () => {
            it('should create failed validation result with errors', () => {
                // Arrange
                const errors = ['Error 1', 'Error 2'];

                // Act
                const result = ValidationResult.failure(errors);

                // Assert
                expect(result.valid).toBe(false);
                expect(result.errors).toEqual(errors);
                expect(result.warnings).toEqual([]);
            });

            it('should create failed validation result with errors and warnings', () => {
                // Arrange
                const errors = ['Error 1'];
                const warnings = ['Warning 1'];

                // Act
                const result = ValidationResult.failure(errors, warnings);

                // Assert
                expect(result.valid).toBe(false);
                expect(result.errors).toEqual(errors);
                expect(result.warnings).toEqual(warnings);
            });

            it('should create failed validation result with metadata', () => {
                // Arrange
                const errors = ['Error 1'];
                const metadata = { attemptedAction: 'deploy' };

                // Act
                const result = ValidationResult.failure(errors, [], metadata);

                // Assert
                expect(result.valid).toBe(false);
                expect(result.metadata).toEqual(metadata);
            });

            it('should have errors', () => {
                // Arrange
                const errors = ['Error 1'];

                // Act
                const result = ValidationResult.failure(errors);

                // Assert
                expect(result.hasErrors()).toBe(true);
            });

            it('should handle multiple errors', () => {
                // Arrange
                const errors = ['Error 1', 'Error 2', 'Error 3'];

                // Act
                const result = ValidationResult.failure(errors);

                // Assert
                expect(result.errors).toHaveLength(3);
            });
        });

        describe('withWarnings', () => {
            it('should create valid result with warnings', () => {
                // Arrange
                const warnings = ['Warning 1'];

                // Act
                const result = ValidationResult.withWarnings(warnings);

                // Assert
                expect(result.valid).toBe(true);
                expect(result.errors).toEqual([]);
                expect(result.warnings).toEqual(warnings);
            });

            it('should create valid result with multiple warnings', () => {
                // Arrange
                const warnings = ['Warning 1', 'Warning 2', 'Warning 3'];

                // Act
                const result = ValidationResult.withWarnings(warnings);

                // Assert
                expect(result.warnings).toHaveLength(3);
                expect(result.hasWarnings()).toBe(true);
            });

            it('should create valid result with warnings and metadata', () => {
                // Arrange
                const warnings = ['Warning 1'];
                const metadata = { stackName: 'test-stack' };

                // Act
                const result = ValidationResult.withWarnings(warnings, metadata);

                // Assert
                expect(result.valid).toBe(true);
                expect(result.warnings).toEqual(warnings);
                expect(result.metadata).toEqual(metadata);
            });

            it('should not have errors', () => {
                // Arrange
                const warnings = ['Warning 1'];

                // Act
                const result = ValidationResult.withWarnings(warnings);

                // Assert
                expect(result.hasErrors()).toBe(false);
            });

            it('should have warnings', () => {
                // Arrange
                const warnings = ['Warning 1'];

                // Act
                const result = ValidationResult.withWarnings(warnings);

                // Assert
                expect(result.hasWarnings()).toBe(true);
            });
        });
    });

    describe('immutability', () => {
        it('should not allow modification of valid', () => {
            // Arrange
            const result = ValidationResult.success();
            const originalValue = result.valid;

            // Act
            try {
                result.valid = false;
            } catch (e) {
                // Expected in strict mode
            }

            // Assert
            expect(result.valid).toBe(originalValue);
        });

        it('should not allow modification of errors array', () => {
            // Arrange
            const result = ValidationResult.failure(['Error 1']);

            // Act & Assert
            expect(() => {
                result.errors.push('Error 2');
            }).toThrow();
        });

        it('should not allow modification of warnings array', () => {
            // Arrange
            const result = ValidationResult.withWarnings(['Warning 1']);

            // Act & Assert
            expect(() => {
                result.warnings.push('Warning 2');
            }).toThrow();
        });

        it('should not allow modification of metadata object', () => {
            // Arrange
            const result = ValidationResult.success({ key: 'value' });
            const originalMetadata = { ...result.metadata };

            // Act
            try {
                result.metadata.newKey = 'newValue';
            } catch (e) {
                // Expected in strict mode
            }

            // Assert
            expect(result.metadata).toEqual(originalMetadata);
            expect(result.metadata.newKey).toBeUndefined();
        });

        it('should be frozen', () => {
            // Arrange
            const result = ValidationResult.success();

            // Act & Assert
            expect(Object.isFrozen(result)).toBe(true);
        });

        it('should have frozen errors array', () => {
            // Arrange
            const result = ValidationResult.failure(['Error 1']);

            // Act & Assert
            expect(Object.isFrozen(result.errors)).toBe(true);
        });

        it('should have frozen warnings array', () => {
            // Arrange
            const result = ValidationResult.withWarnings(['Warning 1']);

            // Act & Assert
            expect(Object.isFrozen(result.warnings)).toBe(true);
        });

        it('should have frozen metadata object', () => {
            // Arrange
            const result = ValidationResult.success({ key: 'value' });

            // Act & Assert
            expect(Object.isFrozen(result.metadata)).toBe(true);
        });

        it('should not allow adding new properties', () => {
            // Arrange
            const result = ValidationResult.success();

            // Act
            try {
                result.newProperty = 'test';
            } catch (e) {
                // Expected in strict mode
            }

            // Assert
            expect(result.newProperty).toBeUndefined();
        });

        it('should create new copy of input arrays', () => {
            // Arrange
            const errors = ['Error 1'];
            const warnings = ['Warning 1'];

            // Act
            const result = new ValidationResult({
                valid: false,
                errors,
                warnings,
            });
            errors.push('Error 2');
            warnings.push('Warning 2');

            // Assert
            expect(result.errors).toEqual(['Error 1']);
            expect(result.warnings).toEqual(['Warning 1']);
        });

        it('should create new copy of input metadata', () => {
            // Arrange
            const metadata = { key: 'value' };

            // Act
            const result = new ValidationResult({
                valid: true,
                metadata,
            });
            metadata.key = 'modified';
            metadata.newKey = 'newValue';

            // Assert
            expect(result.metadata).toEqual({ key: 'value' });
        });
    });

    describe('edge cases', () => {
        it('should handle empty errors array', () => {
            // Arrange
            const result = ValidationResult.failure([]);

            // Act & Assert
            expect(result.valid).toBe(false);
            expect(result.hasErrors()).toBe(false);
        });

        it('should handle empty warnings array', () => {
            // Arrange
            const result = ValidationResult.withWarnings([]);

            // Act & Assert
            expect(result.valid).toBe(true);
            expect(result.hasWarnings()).toBe(false);
        });

        it('should allow valid false with no errors', () => {
            // Arrange & Act
            const result = new ValidationResult({
                valid: false,
                errors: [],
            });

            // Assert
            expect(result.valid).toBe(false);
            expect(result.hasErrors()).toBe(false);
        });

        it('should allow valid true with errors', () => {
            // Arrange & Act
            const result = new ValidationResult({
                valid: true,
                errors: ['Error 1'],
            });

            // Assert
            expect(result.valid).toBe(true);
            expect(result.hasErrors()).toBe(true);
        });

        it('should handle complex metadata structures', () => {
            // Arrange
            const metadata = {
                stackName: 'test-stack',
                resources: {
                    added: ['Resource1', 'Resource2'],
                    modified: ['Resource3'],
                },
                timestamp: Date.now(),
            };

            // Act
            const result = ValidationResult.success(metadata);

            // Assert
            expect(result.metadata).toEqual(metadata);
        });
    });
});
