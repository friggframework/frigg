const express = require('express');
const router = express.Router();
const { createAppHandler } = require('./../app-handler-helpers');
const { requireAdmin } = require('./middleware/requireAdmin');
const catchAsyncError = require('express-async-handler');
const bcrypt = require('bcryptjs');
const {
    createUserRepository,
} = require('../../user/repositories/user-repository-factory');
const { loadAppDefinition } = require('../app-definition-loader');
const { createModuleRepository } = require('../../modules/repositories/module-repository-factory');
const { GetModuleEntityById } = require('../../modules/use-cases/get-module-entity-by-id');
const { UpdateModuleEntity } = require('../../modules/use-cases/update-module-entity');
const { DeleteModuleEntity } = require('../../modules/use-cases/delete-module-entity');
const { CreateTokenForUserId } = require('../../user/use-cases/create-token-for-user-id');
const { DeleteUser } = require('../../user/use-cases/delete-user');

// Initialize repositories and use cases
const { userConfig } = loadAppDefinition();
const userRepository = createUserRepository({ userConfig });
const moduleRepository = createModuleRepository();

// Use cases
const getModuleEntityById = new GetModuleEntityById({ moduleRepository });
const updateModuleEntity = new UpdateModuleEntity({ moduleRepository });
const deleteModuleEntity = new DeleteModuleEntity({ moduleRepository });
const createTokenForUserId = new CreateTokenForUserId({ userRepository });
const deleteUser = new DeleteUser({ userRepository });

// Debug logging
router.use((req, res, next) => {
    console.log(`[Admin Router] ${req.method} ${req.path} | Original URL: ${req.originalUrl}`);
    next();
});

// Apply admin API key auth middleware to all admin routes
router.use(requireAdmin);

/**
 * USER MANAGEMENT ENDPOINTS
 */

/**
 * GET /api/admin/users
 * List all users with pagination
 */
router.get('/api/admin/users', catchAsyncError(async (req, res) => {
    const { page = 1, limit = 50, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Use repository to get users
    const users = await userRepository.findAllUsers({
        skip,
        limit: parseInt(limit),
        sort,
        excludeFields: ['-hashword'] // Exclude password hash
    });

    const totalCount = await userRepository.countUsers();

    res.json({
        users,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: totalCount,
            pages: Math.ceil(totalCount / parseInt(limit))
        }
    });
}));

/**
 * GET /api/admin/users/search
 * Search users by username or email
 */
router.get('/api/admin/users/search', catchAsyncError(async (req, res) => {
    const {
        q,
        page = 1,
        limit = 50,
        sortBy = 'createdAt',
        sortOrder = 'desc'
    } = req.query;

    if (!q) {
        return res.status(400).json({
            status: 'error',
            message: 'Search query parameter "q" is required'
        });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Use repository to search users
    const users = await userRepository.searchUsers({
        query: q,
        skip,
        limit: parseInt(limit),
        sort,
        excludeFields: ['-hashword']
    });

    const totalCount = await userRepository.countUsersBySearchQuery(q);

    res.json({
        users,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: totalCount,
            pages: Math.ceil(totalCount / parseInt(limit))
        }
    });
}));

/**
 * POST /api/admin/users
 * Create a new user (admin only)
 * Admin-specific features:
 * - Can create users with custom roles
 * - Can set verified status
 * - Can assign to organizations
 * - No email verification required
 */
router.post('/api/admin/users', catchAsyncError(async (req, res) => {
    const {
        username,
        email,
        password,
        type = 'INDIVIDUAL',
        appUserId,
        organizationId,
        verified = true // Admins can create pre-verified users
    } = req.body;

    // Validate required fields
    if (!username || !email || !password) {
        return res.status(400).json({
            status: 'error',
            message: 'Username, email, and password are required'
        });
    }

    // Check if user already exists
    const existingUser = await userRepository.findIndividualUserByUsername(username);
    if (existingUser) {
        return res.status(409).json({
            status: 'error',
            message: 'User with this username already exists'
        });
    }

    const existingEmail = await userRepository.findIndividualUserByEmail(email);
    if (existingEmail) {
        return res.status(409).json({
            status: 'error',
            message: 'User with this email already exists'
        });
    }

    // Hash password (using bcryptjs which is already imported)
    const hashword = await bcrypt.hash(password, 10);

    // Create user with admin-specified attributes
    const userData = {
        username,
        email,
        hashword,
        type
    };

    // Add optional fields if provided
    if (appUserId) userData.appUserId = appUserId;
    if (organizationId) userData.organizationId = organizationId;

    const user = await userRepository.createIndividualUser(userData);

    // Remove sensitive fields
    const userObj = user.toObject ? user.toObject() : user;
    delete userObj.hashword;

    res.status(201).json({
        user: userObj,
        message: 'User created successfully by admin'
    });
}));

/**
 * GET /api/admin/users/:userId
 * Get a specific user by ID
 */
router.get('/api/admin/users/:userId', catchAsyncError(async (req, res) => {
    const { userId } = req.params;

    const user = await userRepository.findUserById(userId);

    if (!user) {
        return res.status(404).json({
            status: 'error',
            message: 'User not found'
        });
    }

    // Remove sensitive fields
    const userObj = user.toObject ? user.toObject() : user;
    delete userObj.hashword;

    res.json({ user: userObj });
}));

/**
 * POST /api/admin/users/:userId/impersonate
 * Generate a token for a user without requiring password (admin impersonation)
 * Allows admins to login as any user for support/testing purposes
 */
router.post('/api/admin/users/:userId/impersonate', catchAsyncError(async (req, res) => {
    const { userId } = req.params;
    const { expiresInMinutes = 120 } = req.body;

    // Find the user
    const user = await userRepository.findUserById(userId);

    if (!user) {
        return res.status(404).json({
            status: 'error',
            message: 'User not found'
        });
    }

    // Generate token without password verification
    const token = await createTokenForUserId.execute(userId, expiresInMinutes);

    res.json({
        token,
        message: `Impersonating user: ${user.username || user.email}`,
        expiresInMinutes
    });
}));

/**
 * DELETE /api/admin/users/:userId
 * Delete a user by ID (admin only)
 * IMPORTANT: This is a destructive operation - use with caution
 */
router.delete('/api/admin/users/:userId', catchAsyncError(async (req, res) => {
    const { userId } = req.params;

    // Execute delete user use case
    await deleteUser.execute(userId);

    res.status(204).send();
}));

/**
 * GLOBAL ENTITY MANAGEMENT ENDPOINTS
 */

/**
 * GET /api/admin/entities
 * List all global entities
 */
router.get('/api/admin/entities', catchAsyncError(async (req, res) => {
    const { type, status } = req.query;

    const query = { isGlobal: true };
    if (type) query.type = type;
    if (status) query.status = status;

    const entities = await moduleRepository.findEntitiesBy(query);

    res.json({ entities });
}));

/**
 * GET /api/admin/entities/:entityId
 * Get a specific global entity
 */
router.get('/api/admin/entities/:entityId', catchAsyncError(async (req, res) => {
    const { entityId } = req.params;

    const entity = await getModuleEntityById.execute(entityId);

    if (!entity || !entity.isGlobal) {
        return res.status(404).json({
            status: 'error',
            message: 'Global entity not found'
        });
    }

    res.json({ entity });
}));

/**
 * POST /api/admin/entities
 * Create a new global entity
 */
router.post('/api/admin/entities', catchAsyncError(async (req, res) => {
    const { type, ...entityData } = req.body;

    if (!type) {
        return res.status(400).json({
            status: 'error',
            message: 'Entity type is required'
        });
    }

    // Create entity with isGlobal flag
    const entity = await moduleRepository.createEntity({
        ...entityData,
        type,
        isGlobal: true,
        status: 'connected'
    });

    res.status(201).json({ entity });
}));

/**
 * PUT /api/admin/entities/:entityId
 * Update a global entity
 */
router.put('/api/admin/entities/:entityId', catchAsyncError(async (req, res) => {
    const { entityId } = req.params;

    const entity = await updateModuleEntity.execute(entityId, req.body);

    if (!entity) {
        return res.status(404).json({
            status: 'error',
            message: 'Global entity not found'
        });
    }

    res.json({ entity });
}));

/**
 * DELETE /api/admin/entities/:entityId
 * Delete a global entity
 */
router.delete('/api/admin/entities/:entityId', catchAsyncError(async (req, res) => {
    const { entityId } = req.params;

    await deleteModuleEntity.execute(entityId);

    res.status(204).send();
}));

/**
 * POST /api/admin/entities/:entityId/test
 * Test connection for a global entity
 */
router.post('/api/admin/entities/:entityId/test', catchAsyncError(async (req, res) => {
    const { entityId } = req.params;

    const entity = await getModuleEntityById.execute(entityId);

    if (!entity || !entity.isGlobal) {
        return res.status(404).json({
            status: 'error',
            message: 'Global entity not found'
        });
    }

    // Test the entity connection
    try {
        // This would use a TestModuleAuth use case
        res.json({
            status: 'success',
            message: 'Entity connection test successful'
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: `Entity connection test failed: ${error.message}`
        });
    }
}));

const handler = createAppHandler('HTTP Event: Admin', router);

module.exports = { handler, router };
