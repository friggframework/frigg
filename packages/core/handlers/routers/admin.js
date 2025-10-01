const express = require('express');
const router = express.Router();
const { createAppHandler } = require('./../app-handler-helpers');
const { requireAdmin } = require('./middleware/requireAdmin');
const { User } = require('../backend-utils');
const catchAsyncError = require('express-async-handler');

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
router.get('/users', catchAsyncError(async (req, res) => {
    const { page = 1, limit = 50, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Get total count
    const totalCount = await User.IndividualUser.countDocuments();

    // Get users with pagination
    const users = await User.IndividualUser.find({})
        .select('-hashword') // Exclude password hash
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

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
router.get('/users/search', catchAsyncError(async (req, res) => {
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

    // Build search query - search in username and email fields
    const searchQuery = {
        $or: [
            { username: { $regex: q, $options: 'i' } },
            { email: { $regex: q, $options: 'i' } }
        ]
    };

    // Get total count for search results
    const totalCount = await User.IndividualUser.countDocuments(searchQuery);

    // Get search results with pagination
    const users = await User.IndividualUser.find(searchQuery)
        .select('-hashword') // Exclude password hash
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

    res.json({
        users,
        query: q,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: totalCount,
            pages: Math.ceil(totalCount / parseInt(limit))
        }
    });
}));

/**
 * GLOBAL ENTITY MANAGEMENT ENDPOINTS
 */

/**
 * POST /api/admin/global-entities
 * Create or update a global entity (app owner's connected account)
 */
router.post('/global-entities', async (req, res) => {
    try {
        const { Entity } = require('@friggframework/core/src/models/mongoose');
        const { entityType, credentials, name } = req.body;

        if (!entityType || !credentials) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['entityType', 'credentials']
            });
        }

        // Check if global entity already exists for this type
        let entity = await Entity.findOne({
            type: entityType,
            isGlobal: true
        });

        if (entity) {
            // Update existing global entity
            entity.credentials = credentials;
            entity.name = name || entity.name;
            entity.status = 'connected';
            entity.updatedAt = new Date();
            await entity.save();

            return res.json({
                id: entity._id,
                type: entity.type,
                name: entity.name,
                status: entity.status,
                isGlobal: true,
                message: 'Global entity updated successfully'
            });
        }

        // Create new global entity
        entity = await Entity.create({
            type: entityType,
            name: name || `Global ${entityType}`,
            credentials,
            isGlobal: true,
            userId: null, // No specific user
            status: 'connected',
            isAutoProvisioned: false
        });

        res.status(201).json({
            id: entity._id,
            type: entity.type,
            name: entity.name,
            status: entity.status,
            isGlobal: true,
            message: 'Global entity created successfully'
        });

    } catch (error) {
        console.error('Error creating/updating global entity:', error);
        res.status(500).json({
            error: 'Failed to create/update global entity',
            message: error.message
        });
    }
});

/**
 * GET /api/admin/global-entities
 * List all global entities
 */
router.get('/global-entities', async (req, res) => {
    try {
        const { Entity } = require('@friggframework/core/src/models/mongoose');

        const entities = await Entity.find({
            isGlobal: true
        }).sort({ createdAt: -1 });

        res.json({
            globalEntities: entities.map(e => ({
                id: e._id,
                type: e.type,
                name: e.name,
                status: e.status,
                createdAt: e.createdAt,
                updatedAt: e.updatedAt
            }))
        });

    } catch (error) {
        console.error('Error listing global entities:', error);
        res.status(500).json({
            error: 'Failed to list global entities',
            message: error.message
        });
    }
});

/**
 * GET /api/admin/global-entities/:id
 * Get a specific global entity
 */
router.get('/global-entities/:id', async (req, res) => {
    try {
        const { Entity } = require('@friggframework/core/src/models/mongoose');

        const entity = await Entity.findOne({
            _id: req.params.id,
            isGlobal: true
        });

        if (!entity) {
            return res.status(404).json({
                error: 'Global entity not found'
            });
        }

        res.json({
            id: entity._id,
            type: entity.type,
            name: entity.name,
            status: entity.status,
            isGlobal: true,
            createdAt: entity.createdAt,
            updatedAt: entity.updatedAt
        });

    } catch (error) {
        console.error('Error getting global entity:', error);
        res.status(500).json({
            error: 'Failed to get global entity',
            message: error.message
        });
    }
});

/**
 * DELETE /api/admin/global-entities/:id
 * Delete a global entity (only if not in use)
 */
router.delete('/global-entities/:id', async (req, res) => {
    try {
        const { Entity, Integration } = require('@friggframework/core/src/models/mongoose');

        const entity = await Entity.findOne({
            _id: req.params.id,
            isGlobal: true
        });

        if (!entity) {
            return res.status(404).json({
                error: 'Global entity not found'
            });
        }

        // Check if entity is used by any integrations
        const usageCount = await Integration.countDocuments({
            entities: entity._id
        });

        if (usageCount > 0) {
            return res.status(400).json({
                error: 'Cannot delete global entity',
                message: `This entity is used by ${usageCount} integration(s)`,
                usageCount
            });
        }

        // Safe to delete
        await entity.deleteOne();

        res.json({
            success: true,
            message: 'Global entity deleted successfully',
            deletedEntity: {
                id: entity._id,
                type: entity.type,
                name: entity.name
            }
        });

    } catch (error) {
        console.error('Error deleting global entity:', error);
        res.status(500).json({
            error: 'Failed to delete global entity',
            message: error.message
        });
    }
});

/**
 * POST /api/admin/global-entities/:id/test
 * Test connection for a global entity
 */
router.post('/global-entities/:id/test', async (req, res) => {
    try {
        const { Entity } = require('@friggframework/core/src/models/mongoose');
        const { moduleFactory } = require('./../backend-utils');

        const entity = await Entity.findOne({
            _id: req.params.id,
            isGlobal: true
        });

        if (!entity) {
            return res.status(404).json({
                error: 'Global entity not found'
            });
        }

        // Try to get the module and test the connection
        const Module = moduleFactory.getModule(entity.type);
        if (!Module) {
            return res.status(400).json({
                error: 'Module not found',
                message: `No module configured for entity type: ${entity.type}`
            });
        }

        // Create module instance and test
        const module = await Module.getInstance({
            entityId: entity._id,
            userId: null // Global entities have no specific user
        });

        // Most modules have a testAuth or similar method
        if (typeof module.testAuth === 'function') {
            await module.testAuth();
        } else if (typeof module.test === 'function') {
            await module.test();
        }

        res.json({
            success: true,
            message: 'Connection test successful',
            entityId: entity._id,
            entityType: entity.type
        });

    } catch (error) {
        console.error('Error testing global entity:', error);
        res.status(500).json({
            success: false,
            error: 'Connection test failed',
            message: error.message
        });
    }
});

const handler = createAppHandler('HTTP Event: Admin', router, true, '/api/admin');

module.exports = { handler, router };
