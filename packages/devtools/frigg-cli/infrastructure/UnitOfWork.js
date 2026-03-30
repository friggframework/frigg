/**
 * UnitOfWork
 * Coordinates transactions across repositories
 */
class UnitOfWork {
    constructor(fileSystemAdapter) {
        this.fileSystemAdapter = fileSystemAdapter;
        this.repositories = new Map();
    }

    /**
     * Register a repository
     */
    registerRepository(name, repository) {
        this.repositories.set(name, repository);
        return this;
    }

    /**
     * Commit all tracked operations
     */
    async commit() {
        try {
            await this.fileSystemAdapter.commit();
            return {success: true};
        } catch (error) {
            throw new Error(`Failed to commit transaction: ${error.message}`);
        }
    }

    /**
     * Rollback all tracked operations
     */
    async rollback() {
        return await this.fileSystemAdapter.rollback();
    }

    /**
     * Clear tracked operations without commit/rollback
     */
    clear() {
        this.fileSystemAdapter.clear();
    }
}

module.exports = {UnitOfWork};
