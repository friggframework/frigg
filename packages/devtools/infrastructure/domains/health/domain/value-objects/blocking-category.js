class BlockingCategory {
    static CATEGORIES = {
        BLOCKING: 'BLOCKING',
        WARNING: 'WARNING',
        INFO: 'INFO',
    };

    static BLOCKING_REASONS = {
        INVALID_STACK_STATE: 'INVALID_STACK_STATE',
        ORPHANED_RESOURCE: 'ORPHANED_RESOURCE',
        QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
        MISSING_DEPENDENCY: 'MISSING_DEPENDENCY',
    };

    constructor({ category, reason, description }) {
        if (!category) {
            throw new Error('category is required');
        }

        if (!reason) {
            throw new Error('reason is required');
        }

        if (!description) {
            throw new Error('description is required');
        }

        if (!Object.values(BlockingCategory.CATEGORIES).includes(category)) {
            throw new Error(`Invalid category: ${category}`);
        }

        this.category = category;
        this.reason = reason;
        this.description = description;

        Object.freeze(this);
    }

    isBlocking() {
        return this.category === BlockingCategory.CATEGORIES.BLOCKING;
    }

    isWarning() {
        return this.category === BlockingCategory.CATEGORIES.WARNING;
    }

    isInfo() {
        return this.category === BlockingCategory.CATEGORIES.INFO;
    }
}

module.exports = BlockingCategory;
