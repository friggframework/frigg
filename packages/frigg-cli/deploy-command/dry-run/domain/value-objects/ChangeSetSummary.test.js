/**
 * Tests for ChangeSetSummary Value Object
 */

const { ChangeSetSummary } = require('./ChangeSetSummary');

describe('ChangeSetSummary', () => {
    describe('constructor', () => {
        it('should create summary with all counts', () => {
            // Arrange & Act
            const summary = new ChangeSetSummary({
                add: 3,
                modify: 2,
                remove: 1,
                replace: 1,
            });

            // Assert
            expect(summary.add).toBe(3);
            expect(summary.modify).toBe(2);
            expect(summary.remove).toBe(1);
            expect(summary.replace).toBe(1);
        });

        it('should create summary with default values', () => {
            // Arrange & Act
            const summary = new ChangeSetSummary({});

            // Assert
            expect(summary.add).toBe(0);
            expect(summary.modify).toBe(0);
            expect(summary.remove).toBe(0);
            expect(summary.replace).toBe(0);
        });

        it('should create summary with partial values', () => {
            // Arrange & Act
            const summary = new ChangeSetSummary({
                add: 5,
                modify: 3,
            });

            // Assert
            expect(summary.add).toBe(5);
            expect(summary.modify).toBe(3);
            expect(summary.remove).toBe(0);
            expect(summary.replace).toBe(0);
        });

        it('should accept zero for all counts', () => {
            // Arrange & Act
            const summary = new ChangeSetSummary({
                add: 0,
                modify: 0,
                remove: 0,
                replace: 0,
            });

            // Assert
            expect(summary.add).toBe(0);
            expect(summary.modify).toBe(0);
            expect(summary.remove).toBe(0);
            expect(summary.replace).toBe(0);
        });

        it('should reject negative add count', () => {
            // Arrange & Act & Assert
            expect(() => {
                new ChangeSetSummary({ add: -1 });
            }).toThrow('Change counts must be non-negative');
        });

        it('should reject negative modify count', () => {
            // Arrange & Act & Assert
            expect(() => {
                new ChangeSetSummary({ modify: -1 });
            }).toThrow('Change counts must be non-negative');
        });

        it('should reject negative remove count', () => {
            // Arrange & Act & Assert
            expect(() => {
                new ChangeSetSummary({ remove: -1 });
            }).toThrow('Change counts must be non-negative');
        });

        it('should reject negative replace count', () => {
            // Arrange & Act & Assert
            expect(() => {
                new ChangeSetSummary({ replace: -1 });
            }).toThrow('Change counts must be non-negative');
        });
    });

    describe('total', () => {
        it('should calculate total from add, modify, and remove', () => {
            // Arrange & Act
            const summary = new ChangeSetSummary({
                add: 3,
                modify: 2,
                remove: 1,
                replace: 5,
            });

            // Assert
            expect(summary.total).toBe(6);
        });

        it('should return zero when no changes', () => {
            // Arrange & Act
            const summary = new ChangeSetSummary({});

            // Assert
            expect(summary.total).toBe(0);
        });

        it('should not include replace in total', () => {
            // Arrange & Act
            const summary = new ChangeSetSummary({
                add: 0,
                modify: 0,
                remove: 0,
                replace: 5,
            });

            // Assert
            expect(summary.total).toBe(0);
        });
    });

    describe('hasChanges', () => {
        it('should return true when add count is greater than zero', () => {
            // Arrange
            const summary = new ChangeSetSummary({ add: 1 });

            // Act & Assert
            expect(summary.hasChanges()).toBe(true);
        });

        it('should return true when modify count is greater than zero', () => {
            // Arrange
            const summary = new ChangeSetSummary({ modify: 1 });

            // Act & Assert
            expect(summary.hasChanges()).toBe(true);
        });

        it('should return true when remove count is greater than zero', () => {
            // Arrange
            const summary = new ChangeSetSummary({ remove: 1 });

            // Act & Assert
            expect(summary.hasChanges()).toBe(true);
        });

        it('should return false when all counts are zero', () => {
            // Arrange
            const summary = new ChangeSetSummary({});

            // Act & Assert
            expect(summary.hasChanges()).toBe(false);
        });

        it('should return false when only replace count is greater than zero', () => {
            // Arrange
            const summary = new ChangeSetSummary({ replace: 5 });

            // Act & Assert
            expect(summary.hasChanges()).toBe(false);
        });

        it('should return true when multiple counts are greater than zero', () => {
            // Arrange
            const summary = new ChangeSetSummary({
                add: 2,
                modify: 3,
                remove: 1,
            });

            // Act & Assert
            expect(summary.hasChanges()).toBe(true);
        });
    });

    describe('hasCriticalChanges', () => {
        it('should return true when replace count is greater than zero', () => {
            // Arrange
            const summary = new ChangeSetSummary({ replace: 1 });

            // Act & Assert
            expect(summary.hasCriticalChanges()).toBe(true);
        });

        it('should return true when remove count is greater than zero', () => {
            // Arrange
            const summary = new ChangeSetSummary({ remove: 1 });

            // Act & Assert
            expect(summary.hasCriticalChanges()).toBe(true);
        });

        it('should return true when both replace and remove counts are greater than zero', () => {
            // Arrange
            const summary = new ChangeSetSummary({
                replace: 2,
                remove: 3,
            });

            // Act & Assert
            expect(summary.hasCriticalChanges()).toBe(true);
        });

        it('should return false when only add count is greater than zero', () => {
            // Arrange
            const summary = new ChangeSetSummary({ add: 5 });

            // Act & Assert
            expect(summary.hasCriticalChanges()).toBe(false);
        });

        it('should return false when only modify count is greater than zero', () => {
            // Arrange
            const summary = new ChangeSetSummary({ modify: 5 });

            // Act & Assert
            expect(summary.hasCriticalChanges()).toBe(false);
        });

        it('should return false when all counts are zero', () => {
            // Arrange
            const summary = new ChangeSetSummary({});

            // Act & Assert
            expect(summary.hasCriticalChanges()).toBe(false);
        });
    });

    describe('toObject', () => {
        it('should return object representation with all values', () => {
            // Arrange
            const summary = new ChangeSetSummary({
                add: 3,
                modify: 2,
                remove: 1,
                replace: 1,
            });

            // Act
            const obj = summary.toObject();

            // Assert
            expect(obj).toEqual({
                add: 3,
                modify: 2,
                remove: 1,
                replace: 1,
                total: 6,
            });
        });

        it('should return object with calculated total', () => {
            // Arrange
            const summary = new ChangeSetSummary({
                add: 10,
                modify: 5,
                remove: 2,
                replace: 0,
            });

            // Act
            const obj = summary.toObject();

            // Assert
            expect(obj.total).toBe(17);
        });

        it('should return object with zero values', () => {
            // Arrange
            const summary = new ChangeSetSummary({});

            // Act
            const obj = summary.toObject();

            // Assert
            expect(obj).toEqual({
                add: 0,
                modify: 0,
                remove: 0,
                replace: 0,
                total: 0,
            });
        });
    });

    describe('static factory methods', () => {
        describe('empty', () => {
            it('should create summary with all zeros', () => {
                // Arrange & Act
                const summary = ChangeSetSummary.empty();

                // Assert
                expect(summary.add).toBe(0);
                expect(summary.modify).toBe(0);
                expect(summary.remove).toBe(0);
                expect(summary.replace).toBe(0);
                expect(summary.total).toBe(0);
            });

            it('should create summary with no changes', () => {
                // Arrange & Act
                const summary = ChangeSetSummary.empty();

                // Assert
                expect(summary.hasChanges()).toBe(false);
                expect(summary.hasCriticalChanges()).toBe(false);
            });
        });

        describe('fromChanges', () => {
            it('should create summary from Add actions', () => {
                // Arrange
                const changes = [
                    { ResourceChange: { Action: 'Add' } },
                    { ResourceChange: { Action: 'Add' } },
                    { ResourceChange: { Action: 'Add' } },
                ];

                // Act
                const summary = ChangeSetSummary.fromChanges(changes);

                // Assert
                expect(summary.add).toBe(3);
                expect(summary.modify).toBe(0);
                expect(summary.remove).toBe(0);
                expect(summary.replace).toBe(0);
            });

            it('should create summary from Modify actions without replacement', () => {
                // Arrange
                const changes = [
                    { ResourceChange: { Action: 'Modify', Replacement: 'False' } },
                    { ResourceChange: { Action: 'Modify', Replacement: 'False' } },
                ];

                // Act
                const summary = ChangeSetSummary.fromChanges(changes);

                // Assert
                expect(summary.add).toBe(0);
                expect(summary.modify).toBe(2);
                expect(summary.remove).toBe(0);
                expect(summary.replace).toBe(0);
            });

            it('should create summary from Modify actions with replacement', () => {
                // Arrange
                const changes = [
                    { ResourceChange: { Action: 'Modify', Replacement: 'True' } },
                    { ResourceChange: { Action: 'Modify', Replacement: 'True' } },
                ];

                // Act
                const summary = ChangeSetSummary.fromChanges(changes);

                // Assert
                expect(summary.add).toBe(0);
                expect(summary.modify).toBe(0);
                expect(summary.remove).toBe(0);
                expect(summary.replace).toBe(2);
            });

            it('should create summary from Remove actions', () => {
                // Arrange
                const changes = [
                    { ResourceChange: { Action: 'Remove' } },
                    { ResourceChange: { Action: 'Remove' } },
                ];

                // Act
                const summary = ChangeSetSummary.fromChanges(changes);

                // Assert
                expect(summary.add).toBe(0);
                expect(summary.modify).toBe(0);
                expect(summary.remove).toBe(2);
                expect(summary.replace).toBe(0);
            });

            it('should create summary from mixed actions', () => {
                // Arrange
                const changes = [
                    { ResourceChange: { Action: 'Add' } },
                    { ResourceChange: { Action: 'Modify', Replacement: 'False' } },
                    { ResourceChange: { Action: 'Modify', Replacement: 'True' } },
                    { ResourceChange: { Action: 'Remove' } },
                    { ResourceChange: { Action: 'Add' } },
                ];

                // Act
                const summary = ChangeSetSummary.fromChanges(changes);

                // Assert
                expect(summary.add).toBe(2);
                expect(summary.modify).toBe(1);
                expect(summary.remove).toBe(1);
                expect(summary.replace).toBe(1);
            });

            it('should handle changes with Action at root level', () => {
                // Arrange
                const changes = [
                    { Action: 'Add' },
                    { Action: 'Remove' },
                ];

                // Act
                const summary = ChangeSetSummary.fromChanges(changes);

                // Assert
                expect(summary.add).toBe(1);
                expect(summary.remove).toBe(1);
            });

            it('should create empty summary from empty changes array', () => {
                // Arrange
                const changes = [];

                // Act
                const summary = ChangeSetSummary.fromChanges(changes);

                // Assert
                expect(summary.add).toBe(0);
                expect(summary.modify).toBe(0);
                expect(summary.remove).toBe(0);
                expect(summary.replace).toBe(0);
            });

            it('should ignore changes without action', () => {
                // Arrange
                const changes = [
                    { ResourceChange: { Action: 'Add' } },
                    { ResourceChange: {} },
                    {},
                ];

                // Act
                const summary = ChangeSetSummary.fromChanges(changes);

                // Assert
                expect(summary.add).toBe(1);
                expect(summary.modify).toBe(0);
                expect(summary.remove).toBe(0);
                expect(summary.replace).toBe(0);
            });

            it('should handle Modify without Replacement as modify', () => {
                // Arrange
                const changes = [
                    { ResourceChange: { Action: 'Modify' } },
                ];

                // Act
                const summary = ChangeSetSummary.fromChanges(changes);

                // Assert
                expect(summary.modify).toBe(1);
                expect(summary.replace).toBe(0);
            });
        });
    });

    describe('immutability', () => {
        it('should not allow modification of add', () => {
            // Arrange
            const summary = new ChangeSetSummary({ add: 5 });
            const originalValue = summary.add;

            // Act
            try {
                summary.add = 10;
            } catch (e) {
                // Expected in strict mode
            }

            // Assert
            expect(summary.add).toBe(originalValue);
        });

        it('should not allow modification of modify', () => {
            // Arrange
            const summary = new ChangeSetSummary({ modify: 5 });
            const originalValue = summary.modify;

            // Act
            try {
                summary.modify = 10;
            } catch (e) {
                // Expected in strict mode
            }

            // Assert
            expect(summary.modify).toBe(originalValue);
        });

        it('should not allow modification of remove', () => {
            // Arrange
            const summary = new ChangeSetSummary({ remove: 5 });
            const originalValue = summary.remove;

            // Act
            try {
                summary.remove = 10;
            } catch (e) {
                // Expected in strict mode
            }

            // Assert
            expect(summary.remove).toBe(originalValue);
        });

        it('should not allow modification of replace', () => {
            // Arrange
            const summary = new ChangeSetSummary({ replace: 5 });
            const originalValue = summary.replace;

            // Act
            try {
                summary.replace = 10;
            } catch (e) {
                // Expected in strict mode
            }

            // Assert
            expect(summary.replace).toBe(originalValue);
        });

        it('should be frozen', () => {
            // Arrange
            const summary = new ChangeSetSummary({
                add: 1,
                modify: 2,
                remove: 3,
                replace: 4,
            });

            // Act & Assert
            expect(Object.isFrozen(summary)).toBe(true);
        });

        it('should not allow adding new properties', () => {
            // Arrange
            const summary = new ChangeSetSummary({ add: 1 });

            // Act
            try {
                summary.newProperty = 'test';
            } catch (e) {
                // Expected in strict mode
            }

            // Assert
            expect(summary.newProperty).toBeUndefined();
        });

        it('should return new object from toObject', () => {
            // Arrange
            const summary = new ChangeSetSummary({ add: 5 });

            // Act
            const obj1 = summary.toObject();
            const obj2 = summary.toObject();

            // Assert
            expect(obj1).not.toBe(obj2);
            expect(obj1).toEqual(obj2);
        });
    });
});
