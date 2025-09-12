import express from 'express'
import { createStandardResponse, createErrorResponse, ERROR_CODES, asyncHandler } from '../utils/response.js'

const router = express.Router();

// Helper to get user entities/accounts
async function getUserEntities(userId = null) {
    // TODO: This should integrate with the actual Frigg backend
    // For now, return mock data structure
    return [
        {
            id: 'entity-1',
            name: 'My HubSpot Account',
            type: 'hubspot',
            status: 'connected',
            connectedAt: new Date().toISOString(),
            lastSync: new Date().toISOString(),
            metadata: {
                accountId: 'hubspot-123',
                accountName: 'My Company',
                region: 'us-east-1'
            }
        },
        {
            id: 'entity-2',
            name: 'Salesforce Org',
            type: 'salesforce',
            status: 'connected',
            connectedAt: new Date().toISOString(),
            lastSync: new Date().toISOString(),
            metadata: {
                orgId: 'salesforce-456',
                orgName: 'Sales Org',
                instanceUrl: 'https://mycompany.salesforce.com'
            }
        }
    ];
}

// Helper to get entity by ID
async function getEntityById(entityId, userId = null) {
    const entities = await getUserEntities(userId);
    return entities.find(entity => entity.id === entityId);
}

// Helper to create new entity
async function createEntity(entityData, userId = null) {
    // TODO: Implement actual entity creation logic
    const newEntity = {
        id: `entity-${Date.now()}`,
        ...entityData,
        status: 'connecting',
        connectedAt: new Date().toISOString(),
        lastSync: new Date().toISOString()
    };
    
    return newEntity;
}

// Helper to update entity
async function updateEntity(entityId, updateData, userId = null) {
    // TODO: Implement actual entity update logic
    const entity = await getEntityById(entityId, userId);
    if (!entity) {
        throw new Error('Entity not found');
    }
    
    return {
        ...entity,
        ...updateData,
        lastSync: new Date().toISOString()
    };
}

// Helper to delete entity
async function deleteEntity(entityId, userId = null) {
    // TODO: Implement actual entity deletion logic
    const entity = await getEntityById(entityId, userId);
    if (!entity) {
        throw new Error('Entity not found');
    }
    
    return { success: true, deletedEntityId: entityId };
}

// Helper to test entity connection
async function testEntityConnection(entityId, userId = null) {
    // TODO: Implement actual connection testing
    const entity = await getEntityById(entityId, userId);
    if (!entity) {
        throw new Error('Entity not found');
    }
    
    // Mock connection test
    return {
        entityId,
        status: 'success',
        message: 'Connection test passed',
        timestamp: new Date().toISOString()
    };
}

// =============================================================================
// ENTITIES API ENDPOINTS
// =============================================================================

// GET /api/entities - List all user entities/accounts
router.get('/', asyncHandler(async (req, res) => {
    try {
        const { type, status } = req.query;
        const userId = req.user?.id; // Assuming user ID from auth middleware
        
        let entities = await getUserEntities(userId);
        
        // Apply filters
        if (type) {
            entities = entities.filter(entity => entity.type === type);
        }
        
        if (status) {
            entities = entities.filter(entity => entity.status === status);
        }
        
        res.json(createStandardResponse({
            entities,
            count: entities.length,
            filters: {
                type: type || null,
                status: status || null
            },
            summary: {
                connected: entities.filter(e => e.status === 'connected').length,
                connecting: entities.filter(e => e.status === 'connecting').length,
                error: entities.filter(e => e.status === 'error').length,
                types: [...new Set(entities.map(e => e.type))]
            }
        }));
    } catch (error) {
        res.status(500).json(createErrorResponse(
            ERROR_CODES.INTERNAL_ERROR,
            'Failed to fetch entities',
            error.message
        ));
    }
}));

// GET /api/entities/:id - Get specific entity
router.get('/:id', asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        
        const entity = await getEntityById(id, userId);
        
        if (!entity) {
            return res.status(404).json(createErrorResponse(
                ERROR_CODES.NOT_FOUND,
                'Entity not found',
                `Entity with id '${id}' not found`
            ));
        }
        
        res.json(createStandardResponse(entity));
    } catch (error) {
        res.status(500).json(createErrorResponse(
            ERROR_CODES.INTERNAL_ERROR,
            'Failed to fetch entity',
            error.message
        ));
    }
}));

// POST /api/entities - Create new entity
router.post('/', asyncHandler(async (req, res) => {
    try {
        const { name, type, metadata } = req.body;
        const userId = req.user?.id;
        
        if (!name || !type) {
            return res.status(400).json(createErrorResponse(
                ERROR_CODES.VALIDATION_ERROR,
                'Name and type are required',
                'Request body must include name and type fields'
            ));
        }
        
        const entity = await createEntity({ name, type, metadata }, userId);
        
        res.status(201).json(createStandardResponse({
            entity,
            message: 'Entity created successfully'
        }));
    } catch (error) {
        res.status(500).json(createErrorResponse(
            ERROR_CODES.INTERNAL_ERROR,
            'Failed to create entity',
            error.message
        ));
    }
}));

// PUT /api/entities/:id - Update entity
router.put('/:id', asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;
        const userId = req.user?.id;
        
        const entity = await updateEntity(id, updateData, userId);
        
        res.json(createStandardResponse({
            entity,
            message: 'Entity updated successfully'
        }));
    } catch (error) {
        if (error.message === 'Entity not found') {
            return res.status(404).json(createErrorResponse(
                ERROR_CODES.NOT_FOUND,
                'Entity not found',
                error.message
            ));
        }
        
        res.status(500).json(createErrorResponse(
            ERROR_CODES.INTERNAL_ERROR,
            'Failed to update entity',
            error.message
        ));
    }
}));

// DELETE /api/entities/:id - Delete entity
router.delete('/:id', asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        
        const result = await deleteEntity(id, userId);
        
        res.json(createStandardResponse({
            result,
            message: 'Entity deleted successfully'
        }));
    } catch (error) {
        if (error.message === 'Entity not found') {
            return res.status(404).json(createErrorResponse(
                ERROR_CODES.NOT_FOUND,
                'Entity not found',
                error.message
            ));
        }
        
        res.status(500).json(createErrorResponse(
            ERROR_CODES.INTERNAL_ERROR,
            'Failed to delete entity',
            error.message
        ));
    }
}));

// POST /api/entities/:id/test - Test entity connection
router.post('/:id/test', asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        
        const result = await testEntityConnection(id, userId);
        
        res.json(createStandardResponse({
            ...result,
            message: 'Connection test completed'
        }));
    } catch (error) {
        if (error.message === 'Entity not found') {
            return res.status(404).json(createErrorResponse(
                ERROR_CODES.NOT_FOUND,
                'Entity not found',
                error.message
            ));
        }
        
        res.status(500).json(createErrorResponse(
            ERROR_CODES.INTERNAL_ERROR,
            'Failed to test entity connection',
            error.message
        ));
    }
}));

// GET /api/entities/:id/options - Get entity options
router.get('/:id/options', asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        
        const entity = await getEntityById(id, userId);
        
        if (!entity) {
            return res.status(404).json(createErrorResponse(
                ERROR_CODES.NOT_FOUND,
                'Entity not found',
                `Entity with id '${id}' not found`
            ));
        }
        
        // TODO: Implement actual options fetching based on entity type
        const options = {
            entityId: id,
            entityType: entity.type,
            options: [
                { key: 'sync_frequency', label: 'Sync Frequency', type: 'select', values: ['5min', '15min', '1hour', '1day'] },
                { key: 'auto_sync', label: 'Auto Sync', type: 'boolean', default: true },
                { key: 'notifications', label: 'Notifications', type: 'boolean', default: false }
            ]
        };
        
        res.json(createStandardResponse(options));
    } catch (error) {
        res.status(500).json(createErrorResponse(
            ERROR_CODES.INTERNAL_ERROR,
            'Failed to fetch entity options',
            error.message
        ));
    }
}));

// POST /api/entities/:id/options - Update entity options
router.post('/:id/options', asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;
        const { options } = req.body;
        const userId = req.user?.id;
        
        if (!options) {
            return res.status(400).json(createErrorResponse(
                ERROR_CODES.VALIDATION_ERROR,
                'Options are required',
                'Request body must include an options object'
            ));
        }
        
        const entity = await getEntityById(id, userId);
        
        if (!entity) {
            return res.status(404).json(createErrorResponse(
                ERROR_CODES.NOT_FOUND,
                'Entity not found',
                `Entity with id '${id}' not found`
            ));
        }
        
        // TODO: Implement actual options saving
        const updatedOptions = {
            entityId: id,
            entityType: entity.type,
            options,
            updatedAt: new Date().toISOString()
        };
        
        res.json(createStandardResponse({
            ...updatedOptions,
            message: 'Entity options updated successfully'
        }));
    } catch (error) {
        res.status(500).json(createErrorResponse(
            ERROR_CODES.INTERNAL_ERROR,
            'Failed to update entity options',
            error.message
        ));
    }
}));

export default router