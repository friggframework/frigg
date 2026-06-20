/**
 * Tests for DryRunStatus Value Object
 */

const { DryRunStatus } = require('./DryRunStatus');

describe('DryRunStatus', () => {
    describe('constructor', () => {
        it('should create status with SUCCESS code', () => {
            // Arrange & Act
            const status = new DryRunStatus(DryRunStatus.CODES.SUCCESS);

            // Assert
            expect(status.code).toBe(0);
            expect(status.message).toBe('');
        });

        it('should create status with VALIDATION_ERROR code', () => {
            // Arrange & Act
            const status = new DryRunStatus(DryRunStatus.CODES.VALIDATION_ERROR);

            // Assert
            expect(status.code).toBe(1);
            expect(status.message).toBe('');
        });

        it('should create status with WARNING code', () => {
            // Arrange & Act
            const status = new DryRunStatus(DryRunStatus.CODES.WARNING);

            // Assert
            expect(status.code).toBe(2);
            expect(status.message).toBe('');
        });

        it('should create status with custom message', () => {
            // Arrange
            const message = 'Custom status message';

            // Act
            const status = new DryRunStatus(DryRunStatus.CODES.SUCCESS, message);

            // Assert
            expect(status.message).toBe(message);
        });

        it('should create status with empty message by default', () => {
            // Arrange & Act
            const status = new DryRunStatus(DryRunStatus.CODES.SUCCESS);

            // Assert
            expect(status.message).toBe('');
        });

        it('should reject invalid status code', () => {
            // Arrange & Act & Assert
            expect(() => {
                new DryRunStatus(999);
            }).toThrow('Invalid status code: 999');
        });

        it('should reject negative status code', () => {
            // Arrange & Act & Assert
            expect(() => {
                new DryRunStatus(-1);
            }).toThrow('Invalid status code: -1');
        });

        it('should reject null status code', () => {
            // Arrange & Act & Assert
            expect(() => {
                new DryRunStatus(null);
            }).toThrow('Invalid status code: null');
        });

        it('should reject undefined status code', () => {
            // Arrange & Act & Assert
            expect(() => {
                new DryRunStatus(undefined);
            }).toThrow('Invalid status code: undefined');
        });

        it('should reject string status code', () => {
            // Arrange & Act & Assert
            expect(() => {
                new DryRunStatus('SUCCESS');
            }).toThrow('Invalid status code: SUCCESS');
        });
    });

    describe('static CODES', () => {
        it('should provide SUCCESS code constant', () => {
            // Arrange & Act & Assert
            expect(DryRunStatus.CODES.SUCCESS).toBe(0);
        });

        it('should provide VALIDATION_ERROR code constant', () => {
            // Arrange & Act & Assert
            expect(DryRunStatus.CODES.VALIDATION_ERROR).toBe(1);
        });

        it('should provide WARNING code constant', () => {
            // Arrange & Act & Assert
            expect(DryRunStatus.CODES.WARNING).toBe(2);
        });

        it('should have three code constants', () => {
            // Arrange & Act
            const codes = Object.values(DryRunStatus.CODES);

            // Assert
            expect(codes).toHaveLength(3);
        });

        it('should have unique code values', () => {
            // Arrange & Act
            const codes = Object.values(DryRunStatus.CODES);
            const uniqueCodes = new Set(codes);

            // Assert
            expect(uniqueCodes.size).toBe(codes.length);
        });
    });

    describe('isSuccess', () => {
        it('should return true for SUCCESS code', () => {
            // Arrange
            const status = new DryRunStatus(DryRunStatus.CODES.SUCCESS);

            // Act & Assert
            expect(status.isSuccess()).toBe(true);
        });

        it('should return false for VALIDATION_ERROR code', () => {
            // Arrange
            const status = new DryRunStatus(DryRunStatus.CODES.VALIDATION_ERROR);

            // Act & Assert
            expect(status.isSuccess()).toBe(false);
        });

        it('should return false for WARNING code', () => {
            // Arrange
            const status = new DryRunStatus(DryRunStatus.CODES.WARNING);

            // Act & Assert
            expect(status.isSuccess()).toBe(false);
        });
    });

    describe('hasWarnings', () => {
        it('should return true for WARNING code', () => {
            // Arrange
            const status = new DryRunStatus(DryRunStatus.CODES.WARNING);

            // Act & Assert
            expect(status.hasWarnings()).toBe(true);
        });

        it('should return false for SUCCESS code', () => {
            // Arrange
            const status = new DryRunStatus(DryRunStatus.CODES.SUCCESS);

            // Act & Assert
            expect(status.hasWarnings()).toBe(false);
        });

        it('should return false for VALIDATION_ERROR code', () => {
            // Arrange
            const status = new DryRunStatus(DryRunStatus.CODES.VALIDATION_ERROR);

            // Act & Assert
            expect(status.hasWarnings()).toBe(false);
        });
    });

    describe('hasErrors', () => {
        it('should return true for VALIDATION_ERROR code', () => {
            // Arrange
            const status = new DryRunStatus(DryRunStatus.CODES.VALIDATION_ERROR);

            // Act & Assert
            expect(status.hasErrors()).toBe(true);
        });

        it('should return false for SUCCESS code', () => {
            // Arrange
            const status = new DryRunStatus(DryRunStatus.CODES.SUCCESS);

            // Act & Assert
            expect(status.hasErrors()).toBe(false);
        });

        it('should return false for WARNING code', () => {
            // Arrange
            const status = new DryRunStatus(DryRunStatus.CODES.WARNING);

            // Act & Assert
            expect(status.hasErrors()).toBe(false);
        });
    });

    describe('toObject', () => {
        it('should return object representation for SUCCESS', () => {
            // Arrange
            const status = new DryRunStatus(
                DryRunStatus.CODES.SUCCESS,
                'Everything is fine'
            );

            // Act
            const obj = status.toObject();

            // Assert
            expect(obj).toEqual({
                code: 0,
                message: 'Everything is fine',
                success: true,
            });
        });

        it('should return object representation for VALIDATION_ERROR', () => {
            // Arrange
            const status = new DryRunStatus(
                DryRunStatus.CODES.VALIDATION_ERROR,
                'Validation failed'
            );

            // Act
            const obj = status.toObject();

            // Assert
            expect(obj).toEqual({
                code: 1,
                message: 'Validation failed',
                success: false,
            });
        });

        it('should return object representation for WARNING', () => {
            // Arrange
            const status = new DryRunStatus(
                DryRunStatus.CODES.WARNING,
                'There are warnings'
            );

            // Act
            const obj = status.toObject();

            // Assert
            expect(obj).toEqual({
                code: 2,
                message: 'There are warnings',
                success: false,
            });
        });

        it('should include success based on isSuccess method', () => {
            // Arrange
            const successStatus = new DryRunStatus(DryRunStatus.CODES.SUCCESS);
            const errorStatus = new DryRunStatus(DryRunStatus.CODES.VALIDATION_ERROR);

            // Act
            const successObj = successStatus.toObject();
            const errorObj = errorStatus.toObject();

            // Assert
            expect(successObj.success).toBe(true);
            expect(errorObj.success).toBe(false);
        });
    });

    describe('static factory methods', () => {
        describe('success', () => {
            it('should create status with SUCCESS code', () => {
                // Arrange & Act
                const status = DryRunStatus.success();

                // Assert
                expect(status.code).toBe(DryRunStatus.CODES.SUCCESS);
                expect(status.isSuccess()).toBe(true);
            });

            it('should use default success message', () => {
                // Arrange & Act
                const status = DryRunStatus.success();

                // Assert
                expect(status.message).toBe('Dry-run completed successfully');
            });

            it('should use custom message when provided', () => {
                // Arrange
                const message = 'Custom success message';

                // Act
                const status = DryRunStatus.success(message);

                // Assert
                expect(status.message).toBe(message);
            });

            it('should not have warnings', () => {
                // Arrange & Act
                const status = DryRunStatus.success();

                // Assert
                expect(status.hasWarnings()).toBe(false);
            });

            it('should not have errors', () => {
                // Arrange & Act
                const status = DryRunStatus.success();

                // Assert
                expect(status.hasErrors()).toBe(false);
            });
        });

        describe('withWarnings', () => {
            it('should create status with WARNING code', () => {
                // Arrange & Act
                const status = DryRunStatus.withWarnings();

                // Assert
                expect(status.code).toBe(DryRunStatus.CODES.WARNING);
                expect(status.hasWarnings()).toBe(true);
            });

            it('should use default warning message', () => {
                // Arrange & Act
                const status = DryRunStatus.withWarnings();

                // Assert
                expect(status.message).toBe('Dry-run completed with warnings');
            });

            it('should use custom message when provided', () => {
                // Arrange
                const message = 'Custom warning message';

                // Act
                const status = DryRunStatus.withWarnings(message);

                // Assert
                expect(status.message).toBe(message);
            });

            it('should not be success', () => {
                // Arrange & Act
                const status = DryRunStatus.withWarnings();

                // Assert
                expect(status.isSuccess()).toBe(false);
            });

            it('should not have errors', () => {
                // Arrange & Act
                const status = DryRunStatus.withWarnings();

                // Assert
                expect(status.hasErrors()).toBe(false);
            });
        });

        describe('validationError', () => {
            it('should create status with VALIDATION_ERROR code', () => {
                // Arrange & Act
                const status = DryRunStatus.validationError();

                // Assert
                expect(status.code).toBe(DryRunStatus.CODES.VALIDATION_ERROR);
                expect(status.hasErrors()).toBe(true);
            });

            it('should use default error message', () => {
                // Arrange & Act
                const status = DryRunStatus.validationError();

                // Assert
                expect(status.message).toBe('Dry-run failed validation');
            });

            it('should use custom message when provided', () => {
                // Arrange
                const message = 'Custom error message';

                // Act
                const status = DryRunStatus.validationError(message);

                // Assert
                expect(status.message).toBe(message);
            });

            it('should not be success', () => {
                // Arrange & Act
                const status = DryRunStatus.validationError();

                // Assert
                expect(status.isSuccess()).toBe(false);
            });

            it('should not have warnings', () => {
                // Arrange & Act
                const status = DryRunStatus.validationError();

                // Assert
                expect(status.hasWarnings()).toBe(false);
            });
        });
    });

    describe('immutability', () => {
        it('should not allow modification of code', () => {
            // Arrange
            const status = DryRunStatus.success();
            const originalCode = status.code;

            // Act
            try {
                status.code = DryRunStatus.CODES.VALIDATION_ERROR;
            } catch (e) {
                // Expected in strict mode
            }

            // Assert
            expect(status.code).toBe(originalCode);
        });

        it('should not allow modification of message', () => {
            // Arrange
            const status = DryRunStatus.success();
            const originalMessage = status.message;

            // Act
            try {
                status.message = 'Modified message';
            } catch (e) {
                // Expected in strict mode
            }

            // Assert
            expect(status.message).toBe(originalMessage);
        });

        it('should be frozen', () => {
            // Arrange
            const status = DryRunStatus.success();

            // Act & Assert
            expect(Object.isFrozen(status)).toBe(true);
        });

        it('should not allow adding new properties', () => {
            // Arrange
            const status = DryRunStatus.success();

            // Act
            try {
                status.newProperty = 'test';
            } catch (e) {
                // Expected in strict mode
            }

            // Assert
            expect(status.newProperty).toBeUndefined();
        });

        it('should return new object from toObject each time', () => {
            // Arrange
            const status = DryRunStatus.success();

            // Act
            const obj1 = status.toObject();
            const obj2 = status.toObject();

            // Assert
            expect(obj1).not.toBe(obj2);
            expect(obj1).toEqual(obj2);
        });
    });

    describe('status state transitions', () => {
        it('should handle only one status method returning true', () => {
            // Arrange
            const successStatus = DryRunStatus.success();

            // Act & Assert
            expect(successStatus.isSuccess()).toBe(true);
            expect(successStatus.hasWarnings()).toBe(false);
            expect(successStatus.hasErrors()).toBe(false);
        });

        it('should handle warning status methods correctly', () => {
            // Arrange
            const warningStatus = DryRunStatus.withWarnings();

            // Act & Assert
            expect(warningStatus.isSuccess()).toBe(false);
            expect(warningStatus.hasWarnings()).toBe(true);
            expect(warningStatus.hasErrors()).toBe(false);
        });

        it('should handle error status methods correctly', () => {
            // Arrange
            const errorStatus = DryRunStatus.validationError();

            // Act & Assert
            expect(errorStatus.isSuccess()).toBe(false);
            expect(errorStatus.hasWarnings()).toBe(false);
            expect(errorStatus.hasErrors()).toBe(true);
        });
    });

    describe('edge cases', () => {
        it('should handle empty string message', () => {
            // Arrange & Act
            const status = new DryRunStatus(DryRunStatus.CODES.SUCCESS, '');

            // Assert
            expect(status.message).toBe('');
        });

        it('should handle very long messages', () => {
            // Arrange
            const longMessage = 'A'.repeat(1000);

            // Act
            const status = new DryRunStatus(DryRunStatus.CODES.SUCCESS, longMessage);

            // Assert
            expect(status.message).toBe(longMessage);
            expect(status.message).toHaveLength(1000);
        });

        it('should handle messages with special characters', () => {
            // Arrange
            const message = 'Error: \n\t"Special" <chars> & symbols!';

            // Act
            const status = new DryRunStatus(DryRunStatus.CODES.VALIDATION_ERROR, message);

            // Assert
            expect(status.message).toBe(message);
        });

        it('should handle numeric codes at boundary values', () => {
            // Arrange & Act
            const status0 = new DryRunStatus(0);
            const status1 = new DryRunStatus(1);
            const status2 = new DryRunStatus(2);

            // Assert
            expect(status0.code).toBe(0);
            expect(status1.code).toBe(1);
            expect(status2.code).toBe(2);
        });
    });
});
