const BlockingCategory = require('./blocking-category');

describe('BlockingCategory', () => {
    describe('constructor', () => {
        it('should create blocking category for invalid stack state', () => {
            const category = new BlockingCategory({
                category: BlockingCategory.CATEGORIES.BLOCKING,
                reason: BlockingCategory.BLOCKING_REASONS.INVALID_STACK_STATE,
                description: 'Stack in ROLLBACK_COMPLETE',
            });

            expect(category.category).toBe(BlockingCategory.CATEGORIES.BLOCKING);
            expect(category.reason).toBe(BlockingCategory.BLOCKING_REASONS.INVALID_STACK_STATE);
            expect(category.description).toBe('Stack in ROLLBACK_COMPLETE');
        });

        it('should create warning category for property drift', () => {
            const category = new BlockingCategory({
                category: BlockingCategory.CATEGORIES.WARNING,
                reason: 'PROPERTY_DRIFT',
                description: 'Mutable property drift detected',
            });

            expect(category.category).toBe(BlockingCategory.CATEGORIES.WARNING);
            expect(category.reason).toBe('PROPERTY_DRIFT');
            expect(category.description).toBe('Mutable property drift detected');
        });

        it('should create info category', () => {
            const category = new BlockingCategory({
                category: BlockingCategory.CATEGORIES.INFO,
                reason: 'OTHER',
                description: 'Informational message',
            });

            expect(category.category).toBe(BlockingCategory.CATEGORIES.INFO);
            expect(category.reason).toBe('OTHER');
        });

        it('should reject missing category', () => {
            expect(() => {
                new BlockingCategory({
                    reason: 'SOME_REASON',
                    description: 'Test',
                });
            }).toThrow('category is required');
        });

        it('should reject invalid category', () => {
            expect(() => {
                new BlockingCategory({
                    category: 'INVALID',
                    reason: 'SOME_REASON',
                    description: 'Test',
                });
            }).toThrow('Invalid category: INVALID');
        });

        it('should reject missing reason', () => {
            expect(() => {
                new BlockingCategory({
                    category: BlockingCategory.CATEGORIES.BLOCKING,
                    description: 'Test',
                });
            }).toThrow('reason is required');
        });

        it('should reject missing description', () => {
            expect(() => {
                new BlockingCategory({
                    category: BlockingCategory.CATEGORIES.BLOCKING,
                    reason: BlockingCategory.BLOCKING_REASONS.INVALID_STACK_STATE,
                });
            }).toThrow('description is required');
        });
    });

    describe('isBlocking', () => {
        it('should return true for blocking category', () => {
            const category = new BlockingCategory({
                category: BlockingCategory.CATEGORIES.BLOCKING,
                reason: BlockingCategory.BLOCKING_REASONS.ORPHANED_RESOURCE,
                description: 'Test blocking',
            });

            expect(category.isBlocking()).toBe(true);
        });

        it('should return false for warning category', () => {
            const category = new BlockingCategory({
                category: BlockingCategory.CATEGORIES.WARNING,
                reason: 'PROPERTY_DRIFT',
                description: 'Test warning',
            });

            expect(category.isBlocking()).toBe(false);
        });

        it('should return false for info category', () => {
            const category = new BlockingCategory({
                category: BlockingCategory.CATEGORIES.INFO,
                reason: 'OTHER',
                description: 'Test info',
            });

            expect(category.isBlocking()).toBe(false);
        });
    });

    describe('isWarning', () => {
        it('should return true for warning category', () => {
            const category = new BlockingCategory({
                category: BlockingCategory.CATEGORIES.WARNING,
                reason: 'PROPERTY_DRIFT',
                description: 'Test warning',
            });

            expect(category.isWarning()).toBe(true);
        });

        it('should return false for blocking category', () => {
            const category = new BlockingCategory({
                category: BlockingCategory.CATEGORIES.BLOCKING,
                reason: BlockingCategory.BLOCKING_REASONS.INVALID_STACK_STATE,
                description: 'Test blocking',
            });

            expect(category.isWarning()).toBe(false);
        });

        it('should return false for info category', () => {
            const category = new BlockingCategory({
                category: BlockingCategory.CATEGORIES.INFO,
                reason: 'OTHER',
                description: 'Test info',
            });

            expect(category.isWarning()).toBe(false);
        });
    });

    describe('isInfo', () => {
        it('should return true for info category', () => {
            const category = new BlockingCategory({
                category: BlockingCategory.CATEGORIES.INFO,
                reason: 'OTHER',
                description: 'Test info',
            });

            expect(category.isInfo()).toBe(true);
        });

        it('should return false for blocking category', () => {
            const category = new BlockingCategory({
                category: BlockingCategory.CATEGORIES.BLOCKING,
                reason: BlockingCategory.BLOCKING_REASONS.INVALID_STACK_STATE,
                description: 'Test blocking',
            });

            expect(category.isInfo()).toBe(false);
        });

        it('should return false for warning category', () => {
            const category = new BlockingCategory({
                category: BlockingCategory.CATEGORIES.WARNING,
                reason: 'PROPERTY_DRIFT',
                description: 'Test warning',
            });

            expect(category.isInfo()).toBe(false);
        });
    });

    describe('immutability', () => {
        it('should be frozen', () => {
            const category = new BlockingCategory({
                category: BlockingCategory.CATEGORIES.BLOCKING,
                reason: BlockingCategory.BLOCKING_REASONS.INVALID_STACK_STATE,
                description: 'Test',
            });

            expect(Object.isFrozen(category)).toBe(true);
        });
    });

    describe('constants', () => {
        it('should have BLOCKING, WARNING, INFO categories', () => {
            expect(BlockingCategory.CATEGORIES).toEqual({
                BLOCKING: 'BLOCKING',
                WARNING: 'WARNING',
                INFO: 'INFO',
            });
        });

        it('should have blocking reasons', () => {
            expect(BlockingCategory.BLOCKING_REASONS).toEqual({
                INVALID_STACK_STATE: 'INVALID_STACK_STATE',
                ORPHANED_RESOURCE: 'ORPHANED_RESOURCE',
                QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
                MISSING_DEPENDENCY: 'MISSING_DEPENDENCY',
            });
        });
    });
});
