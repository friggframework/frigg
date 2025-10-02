/**
 * User Repository Interface
 * Abstract base class defining the contract for user persistence adapters
 *
 * This follows the Port in Hexagonal Architecture:
 * - Domain layer depends on this abstraction
 * - Concrete adapters implement this interface
 * - Use cases receive repositories via dependency injection
 *
 * Note: Currently, User model has identical structure across MongoDB and PostgreSQL,
 * so UserRepository serves both. This interface exists for consistency and
 * future-proofing if database-specific implementations become needed.
 *
 * @abstract
 */
class UserRepositoryInterface {
    /**
     * Get session token from base64 buffer token
     *
     * @param {string} token - Base64 buffer token
     * @returns {Promise<Object>} Session token object
     * @abstract
     */
    async getSessionToken(token) {
        throw new Error(
            'Method getSessionToken must be implemented by subclass'
        );
    }

    /**
     * Find organization user by ID
     *
     * @param {string|number} userId - User ID
     * @returns {Promise<Object|null>} User object or null
     * @abstract
     */
    async findOrganizationUserById(userId) {
        throw new Error(
            'Method findOrganizationUserById must be implemented by subclass'
        );
    }

    /**
     * Find individual user by ID
     *
     * @param {string|number} userId - User ID
     * @returns {Promise<Object|null>} User object or null
     * @abstract
     */
    async findIndividualUserById(userId) {
        throw new Error(
            'Method findIndividualUserById must be implemented by subclass'
        );
    }

    /**
     * Create token with expiration
     *
     * @param {string|number} userId - User ID
     * @param {string} rawToken - Raw unhashed token
     * @param {number} minutes - Minutes until expiration (default 120)
     * @returns {Promise<string>} Base64 buffer token
     * @abstract
     */
    async createToken(userId, rawToken, minutes = 120) {
        throw new Error('Method createToken must be implemented by subclass');
    }

    /**
     * Create individual user
     *
     * @param {Object} params - User creation parameters
     * @returns {Promise<Object>} Created user object
     * @abstract
     */
    async createIndividualUser(params) {
        throw new Error(
            'Method createIndividualUser must be implemented by subclass'
        );
    }

    /**
     * Create organization user
     *
     * @param {Object} params - Organization creation parameters
     * @returns {Promise<Object>} Created organization object
     * @abstract
     */
    async createOrganizationUser(params) {
        throw new Error(
            'Method createOrganizationUser must be implemented by subclass'
        );
    }

    /**
     * Find individual user by username
     *
     * @param {string} username - Username to search for
     * @returns {Promise<Object|null>} User object or null
     * @abstract
     */
    async findIndividualUserByUsername(username) {
        throw new Error(
            'Method findIndividualUserByUsername must be implemented by subclass'
        );
    }

    /**
     * Find individual user by app user ID
     *
     * @param {string} appUserId - App user ID to search for
     * @returns {Promise<Object|null>} User object or null
     * @abstract
     */
    async findIndividualUserByAppUserId(appUserId) {
        throw new Error(
            'Method findIndividualUserByAppUserId must be implemented by subclass'
        );
    }

    /**
     * Find organization user by app org ID
     *
     * @param {string} appOrgId - App organization ID to search for
     * @returns {Promise<Object|null>} User object or null
     * @abstract
     */
    async findOrganizationUserByAppOrgId(appOrgId) {
        throw new Error(
            'Method findOrganizationUserByAppOrgId must be implemented by subclass'
        );
    }

    /**
     * Find user by ID (any type)
     *
     * @param {string|number} userId - User ID
     * @returns {Promise<Object|null>} User object or null
     * @abstract
     */
    async findUserById(userId) {
        throw new Error('Method findUserById must be implemented by subclass');
    }

    /**
     * Find individual user by email
     *
     * @param {string} email - Email to search for
     * @returns {Promise<Object|null>} User object or null
     * @abstract
     */
    async findIndividualUserByEmail(email) {
        throw new Error(
            'Method findIndividualUserByEmail must be implemented by subclass'
        );
    }

    /**
     * Update individual user
     *
     * @param {string|number} userId - User ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Updated user object
     * @abstract
     */
    async updateIndividualUser(userId, updates) {
        throw new Error(
            'Method updateIndividualUser must be implemented by subclass'
        );
    }

    /**
     * Update organization user
     *
     * @param {string|number} userId - User ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Updated user object
     * @abstract
     */
    async updateOrganizationUser(userId, updates) {
        throw new Error(
            'Method updateOrganizationUser must be implemented by subclass'
        );
    }

    /**
     * Delete user by ID
     *
     * @param {string|number} userId - User ID to delete
     * @returns {Promise<boolean>} True if deleted successfully
     * @abstract
     */
    async deleteUser(userId) {
        throw new Error('Method deleteUser must be implemented by subclass');
    }

    /**
     * Find all users with pagination
     *
     * @param {Object} options - Query options
     * @param {number} [options.skip] - Number of records to skip
     * @param {number} [options.limit] - Maximum number of records to return
     * @param {Object} [options.sort] - Sort criteria (e.g., { createdAt: -1 })
     * @param {Array<string>} [options.excludeFields] - Fields to exclude (e.g., ['-hashword'])
     * @returns {Promise<Array<Object>>} Array of user objects
     * @abstract
     */
    async findAllUsers(options = {}) {
        throw new Error('Method findAllUsers must be implemented by subclass');
    }

    /**
     * Get total user count
     *
     * @returns {Promise<number>} Total number of users
     * @abstract
     */
    async countUsers() {
        throw new Error('Method countUsers must be implemented by subclass');
    }

    /**
     * Search users by username or email
     *
     * @param {Object} options - Search options
     * @param {string} options.query - Search query string
     * @param {number} [options.skip] - Number of records to skip
     * @param {number} [options.limit] - Maximum number of records to return
     * @param {Object} [options.sort] - Sort criteria (e.g., { createdAt: -1 })
     * @param {Array<string>} [options.excludeFields] - Fields to exclude (e.g., ['-hashword'])
     * @returns {Promise<Array<Object>>} Array of matching user objects
     * @abstract
     */
    async searchUsers(options = {}) {
        throw new Error('Method searchUsers must be implemented by subclass');
    }

    /**
     * Count users matching search query
     *
     * @param {string} query - Search query string
     * @returns {Promise<number>} Number of matching users
     * @abstract
     */
    async countUsersBySearchQuery(query) {
        throw new Error(
            'Method countUsersBySearchQuery must be implemented by subclass'
        );
    }
}

module.exports = { UserRepositoryInterface };
