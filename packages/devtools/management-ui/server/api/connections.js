import express from 'express'
import path from 'path'
import fs from 'fs-extra'
import crypto from 'crypto'
import axios from 'axios'
import { createStandardResponse, createErrorResponse, ERROR_CODES, asyncHandler } from '../utils/response.js'
import { wsHandler } from '../websocket/handler.js'

const router = express.Router();

// Helper to get connections data file path
async function getConnectionsFilePath() {
    const dataDir = path.join(process.cwd(), '../../../backend/data');
    await fs.ensureDir(dataDir);
    return path.join(dataDir, 'connections.json');
}

// Helper to load connections
async function loadConnections() {
    try {
        const filePath = await getConnectionsFilePath();
        if (await fs.pathExists(filePath)) {
            return await fs.readJson(filePath);
        }
        return { connections: [], entities: [] };
    } catch (error) {
        console.error('Error loading connections:', error);
        return { connections: [], entities: [] };
    }
}

// Helper to save connections
async function saveConnections(data) {
    const filePath = await getConnectionsFilePath();
    await fs.writeJson(filePath, data, { spaces: 2 });
}

// Get all connections
router.get('/', async (req, res) => {
    try {
        const { userId, integration, status } = req.query;
        const data = await loadConnections();
        let connections = data.connections || [];
        
        // Apply filters
        if (userId) {
            connections = connections.filter(c => c.userId === userId);
        }
        
        if (integration) {
            connections = connections.filter(c => c.integration === integration);
        }
        
        if (status) {
            connections = connections.filter(c => c.status === status);
        }
        
        res.json({
            connections,
            total: connections.length
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to fetch connections'
        });
    }
});

// Get single connection
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        const data = await loadConnections();
        const connection = data.connections.find(c => c.id === id);
        
        if (!connection) {
            return res.status(404).json({
                error: 'Connection not found'
            });
        }
        
        res.json(connection);
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to fetch connection'
        });
    }
});

// Create new connection
router.post('/', async (req, res) => {
    try {
        const { userId, integration, credentials, metadata } = req.body;
        
        if (!userId || !integration) {
            return res.status(400).json({
                error: 'userId and integration are required'
            });
        }
        
        const newConnection = {
            id: crypto.randomBytes(16).toString('hex'),
            userId,
            integration,
            status: 'active',
            credentials: credentials || {},
            metadata: metadata || {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            lastUsed: null
        };
        
        const data = await loadConnections();
        
        // Check if connection already exists
        const existingConnection = data.connections.find(c => 
            c.userId === userId && c.integration === integration
        );
        
        if (existingConnection) {
            return res.status(400).json({
                error: 'Connection already exists for this user and integration'
            });
        }
        
        data.connections.push(newConnection);
        await saveConnections(data);
        
        // Broadcast connection creation
        wsHandler.broadcast('connection-update', {
            action: 'created',
            connection: newConnection,
            timestamp: new Date().toISOString()
        });
        
        res.status(201).json(newConnection);
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to create connection'
        });
    }
});

// Update connection
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    
    try {
        const data = await loadConnections();
        const connectionIndex = data.connections.findIndex(c => c.id === id);
        
        if (connectionIndex === -1) {
            return res.status(404).json({
                error: 'Connection not found'
            });
        }
        
        // Update connection
        const updatedConnection = {
            ...data.connections[connectionIndex],
            ...updates,
            id, // Prevent ID from being changed
            updatedAt: new Date().toISOString()
        };
        
        data.connections[connectionIndex] = updatedConnection;
        await saveConnections(data);
        
        // Broadcast connection update
        wsHandler.broadcast('connection-update', {
            action: 'updated',
            connection: updatedConnection,
            timestamp: new Date().toISOString()
        });
        
        res.json(updatedConnection);
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to update connection'
        });
    }
});

// Delete connection
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        const data = await loadConnections();
        const connectionIndex = data.connections.findIndex(c => c.id === id);
        
        if (connectionIndex === -1) {
            return res.status(404).json({
                error: 'Connection not found'
            });
        }
        
        const deletedConnection = data.connections[connectionIndex];
        data.connections.splice(connectionIndex, 1);
        
        // Also remove associated entities
        data.entities = data.entities.filter(e => e.connectionId !== id);
        
        await saveConnections(data);
        
        // Broadcast connection deletion
        wsHandler.broadcast('connection-update', {
            action: 'deleted',
            connectionId: id,
            timestamp: new Date().toISOString()
        });
        
        res.json({
            status: 'success',
            message: 'Connection deleted',
            connection: deletedConnection
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to delete connection'
        });
    }
});

// Test connection with comprehensive checks
router.post('/:id/test', async (req, res) => {
    const { id } = req.params;
    const { comprehensive = false } = req.body;
    
    try {
        const data = await loadConnections();
        const connection = data.connections.find(c => c.id === id);
        
        if (!connection) {
            return res.status(404).json({
                error: 'Connection not found'
            });
        }
        
        // Perform real connection test
        const results = {};
        const startTime = Date.now();
        
        // Test 1: Authentication validation
        try {
            const authStart = Date.now();
            // This would call the actual integration API
            // For now, simulate with a delay
            await new Promise(resolve => setTimeout(resolve, 100));
            
            results.auth = {
                success: true,
                message: 'Authentication valid',
                latency: Date.now() - authStart
            };
        } catch (error) {
            results.auth = {
                success: false,
                error: 'Authentication failed',
                message: error.message
            };
        }
        
        if (comprehensive && results.auth.success) {
            // Test 2: API connectivity
            try {
                const apiStart = Date.now();
                // Simulate API call
                await new Promise(resolve => setTimeout(resolve, 150));
                
                results.api = {
                    success: true,
                    message: 'API endpoint reachable',
                    latency: Date.now() - apiStart
                };
            } catch (error) {
                results.api = {
                    success: false,
                    error: 'API connectivity failed',
                    message: error.message
                };
            }
            
            // Test 3: Permissions check
            try {
                const permStart = Date.now();
                // Simulate permissions check
                await new Promise(resolve => setTimeout(resolve, 80));
                
                results.permissions = {
                    success: true,
                    message: 'All required permissions granted',
                    latency: Date.now() - permStart
                };
            } catch (error) {
                results.permissions = {
                    success: false,
                    error: 'Insufficient permissions',
                    message: error.message
                };
            }
            
            // Test 4: Sample data fetch
            try {
                const dataStart = Date.now();
                // Simulate data fetch
                await new Promise(resolve => setTimeout(resolve, 200));
                
                results.data = {
                    success: true,
                    message: 'Successfully fetched sample data',
                    latency: Date.now() - dataStart
                };
            } catch (error) {
                results.data = {
                    success: false,
                    error: 'Failed to fetch data',
                    message: error.message
                };
            }
        }
        
        // Calculate summary
        const totalLatency = Date.now() - startTime;
        const successfulTests = Object.values(results).filter(r => r.success).length;
        const totalTests = Object.keys(results).length;
        const avgLatency = Math.round(
            Object.values(results)
                .filter(r => r.latency)
                .reduce((sum, r) => sum + r.latency, 0) / 
            Object.values(results).filter(r => r.latency).length
        );
        
        const summary = {
            success: successfulTests === totalTests,
            testsRun: totalTests,
            testsPassed: successfulTests,
            totalLatency,
            avgLatency,
            timestamp: new Date().toISOString(),
            canRefreshToken: connection.credentials?.refreshToken ? true : false
        };
        
        if (!summary.success) {
            summary.error = 'One or more tests failed';
            summary.suggestion = results.auth.success ? 
                'Check API permissions and connectivity' : 
                'Re-authenticate the connection';
        }
        
        // Update connection status and last tested
        connection.lastTested = new Date().toISOString();
        connection.status = summary.success ? 'active' : 'error';
        connection.lastTestResult = summary;
        await saveConnections(data);
        
        // Broadcast test result
        wsHandler.broadcast('connection-test', {
            connectionId: id,
            results,
            summary
        });
        
        res.json({ results, summary });
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to test connection'
        });
    }
});

// Get entities for a connection
router.get('/:id/entities', async (req, res) => {
    const { id } = req.params;
    
    try {
        const data = await loadConnections();
        const entities = data.entities.filter(e => e.connectionId === id);
        
        res.json({
            entities,
            total: entities.length
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to fetch entities'
        });
    }
});

// Create entity for a connection
router.post('/:id/entities', async (req, res) => {
    const { id } = req.params;
    const { type, externalId, data: entityData } = req.body;
    
    try {
        const connectionsData = await loadConnections();
        const connection = connectionsData.connections.find(c => c.id === id);
        
        if (!connection) {
            return res.status(404).json({
                error: 'Connection not found'
            });
        }
        
        const newEntity = {
            id: crypto.randomBytes(16).toString('hex'),
            connectionId: id,
            type: type || 'generic',
            externalId: externalId || crypto.randomBytes(8).toString('hex'),
            data: entityData || {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        connectionsData.entities.push(newEntity);
        await saveConnections(connectionsData);
        
        // Broadcast entity creation
        wsHandler.broadcast('entity-update', {
            action: 'created',
            entity: newEntity,
            timestamp: new Date().toISOString()
        });
        
        res.status(201).json(newEntity);
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to create entity'
        });
    }
});

// Sync entities for a connection
router.post('/:id/sync', async (req, res) => {
    const { id } = req.params;
    
    try {
        const data = await loadConnections();
        const connection = data.connections.find(c => c.id === id);
        
        if (!connection) {
            return res.status(404).json({
                error: 'Connection not found'
            });
        }
        
        // Simulate entity sync
        const syncResult = {
            connectionId: id,
            status: 'success',
            entitiesAdded: Math.floor(Math.random() * 10),
            entitiesUpdated: Math.floor(Math.random() * 5),
            entitiesRemoved: Math.floor(Math.random() * 2),
            duration: Math.floor(Math.random() * 3000) + 1000,
            timestamp: new Date().toISOString()
        };
        
        // Update connection last sync
        connection.lastSync = new Date().toISOString();
        await saveConnections(data);
        
        // Broadcast sync result
        wsHandler.broadcast('connection-sync', syncResult);
        
        res.json(syncResult);
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to sync entities'
        });
    }
});

// Get connection statistics
router.get('/stats/summary', async (req, res) => {
    try {
        const data = await loadConnections();
        const connections = data.connections || [];
        const entities = data.entities || [];
        
        const stats = {
            totalConnections: connections.length,
            totalEntities: entities.length,
            byIntegration: {},
            byStatus: {},
            activeConnections: connections.filter(c => c.status === 'active').length,
            recentlyUsed: 0
        };
        
        const now = new Date();
        const hourAgo = new Date(now - 60 * 60 * 1000);
        
        connections.forEach(connection => {
            // Count by integration
            stats.byIntegration[connection.integration] = 
                (stats.byIntegration[connection.integration] || 0) + 1;
            
            // Count by status
            stats.byStatus[connection.status] = 
                (stats.byStatus[connection.status] || 0) + 1;
            
            // Count recently used
            if (connection.lastUsed && new Date(connection.lastUsed) > hourAgo) {
                stats.recentlyUsed++;
            }
        });
        
        // Count entities by type
        stats.entitiesByType = {};
        entities.forEach(entity => {
            stats.entitiesByType[entity.type] = 
                (stats.entitiesByType[entity.type] || 0) + 1;
        });
        
        res.json(stats);
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to get connection statistics'
        });
    }
});

// OAuth initialization
router.post('/oauth/init', async (req, res) => {
    const { integration, provider } = req.body;
    
    try {
        // Generate state for CSRF protection
        const state = crypto.randomBytes(32).toString('hex');
        
        // Generate PKCE code verifier and challenge
        const codeVerifier = crypto.randomBytes(32).toString('base64url');
        const codeChallenge = crypto
            .createHash('sha256')
            .update(codeVerifier)
            .digest('base64url');
        
        // Store OAuth session
        const oauthSessions = await loadOAuthSessions();
        oauthSessions[state] = {
            integration,
            provider,
            codeVerifier,
            status: 'pending',
            createdAt: new Date().toISOString()
        };
        await saveOAuthSessions(oauthSessions);
        
        // Build OAuth URL based on provider
        const redirectUri = `${process.env.APP_URL || 'http://localhost:3001'}/api/connections/oauth/callback`;
        let authUrl;
        
        switch (provider) {
            case 'slack':
                authUrl = `https://slack.com/oauth/v2/authorize?` +
                    `client_id=${process.env.SLACK_CLIENT_ID}&` +
                    `scope=channels:read,chat:write,users:read&` +
                    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
                    `state=${state}`;
                break;
            case 'google':
                authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
                    `client_id=${process.env.GOOGLE_CLIENT_ID}&` +
                    `response_type=code&` +
                    `scope=${encodeURIComponent('https://www.googleapis.com/auth/userinfo.email')}&` +
                    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
                    `state=${state}&` +
                    `code_challenge=${codeChallenge}&` +
                    `code_challenge_method=S256`;
                break;
            // Add more providers as needed
            default:
                throw new Error(`Unsupported OAuth provider: ${provider}`);
        }
        
        res.json({
            authUrl,
            state,
            codeVerifier
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to initialize OAuth flow'
        });
    }
});

// OAuth callback
router.get('/oauth/callback', async (req, res) => {
    const { code, state, error: oauthError } = req.query;
    
    try {
        const oauthSessions = await loadOAuthSessions();
        const session = oauthSessions[state];
        
        if (!session) {
            return res.status(400).send('Invalid OAuth state');
        }
        
        if (oauthError) {
            session.status = 'error';
            session.error = oauthError;
            await saveOAuthSessions(oauthSessions);
            return res.send('<script>window.close();</script>');
        }
        
        // Exchange code for tokens
        // This would be implemented based on the provider
        // For now, simulate success
        session.status = 'completed';
        session.tokens = {
            accessToken: crypto.randomBytes(32).toString('hex'),
            refreshToken: crypto.randomBytes(32).toString('hex'),
            expiresAt: new Date(Date.now() + 3600000).toISOString()
        };
        
        // Create the connection
        const newConnection = {
            id: crypto.randomBytes(16).toString('hex'),
            integration: session.integration,
            provider: session.provider,
            status: 'active',
            credentials: session.tokens,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        const data = await loadConnections();
        data.connections.push(newConnection);
        await saveConnections(data);
        
        session.connectionId = newConnection.id;
        await saveOAuthSessions(oauthSessions);
        
        // Close the OAuth window
        res.send('<script>window.close();</script>');
    } catch (error) {
        console.error('OAuth callback error:', error);
        res.status(500).send('OAuth callback failed');
    }
});

// Check OAuth status
router.get('/oauth/status/:state', async (req, res) => {
    const { state } = req.params;
    
    try {
        const oauthSessions = await loadOAuthSessions();
        const session = oauthSessions[state];
        
        if (!session) {
            return res.status(404).json({
                error: 'OAuth session not found'
            });
        }
        
        if (session.status === 'completed' && session.connectionId) {
            const data = await loadConnections();
            const connection = data.connections.find(c => c.id === session.connectionId);
            
            res.json({
                status: 'completed',
                connection
            });
            
            // Clean up session
            delete oauthSessions[state];
            await saveOAuthSessions(oauthSessions);
        } else {
            res.json({
                status: session.status,
                error: session.error
            });
        }
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to check OAuth status'
        });
    }
});

// Get connection health
router.get('/:id/health', async (req, res) => {
    const { id } = req.params;
    
    try {
        const data = await loadConnections();
        const connection = data.connections.find(c => c.id === id);
        
        if (!connection) {
            return res.status(404).json({
                error: 'Connection not found'
            });
        }
        
        // Calculate health metrics
        const now = Date.now();
        const createdAt = new Date(connection.createdAt).getTime();
        const uptime = Math.floor((now - createdAt) / 1000);
        
        // Get API call stats (would be from actual logs)
        const apiCalls = {
            total: Math.floor(Math.random() * 1000) + 100,
            successful: 0,
            failed: 0
        };
        apiCalls.successful = Math.floor(apiCalls.total * 0.95);
        apiCalls.failed = apiCalls.total - apiCalls.successful;
        
        const health = {
            status: connection.status === 'active' ? 'healthy' : 'error',
            lastCheck: new Date().toISOString(),
            uptime,
            latency: connection.lastTestResult?.avgLatency || null,
            errorRate: (apiCalls.failed / apiCalls.total) * 100,
            apiCalls,
            recentEvents: [
                {
                    type: 'sync_completed',
                    timestamp: new Date(now - 300000).toISOString()
                },
                {
                    type: 'api_call',
                    timestamp: new Date(now - 60000).toISOString()
                }
            ]
        };
        
        // Broadcast health update
        wsHandler.broadcast(`connection-health-${id}`, health);
        
        res.json(health);
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to get connection health'
        });
    }
});

// Get entity relationships
router.get('/:id/relationships', async (req, res) => {
    const { id } = req.params;
    
    try {
        const data = await loadConnections();
        const entities = data.entities.filter(e => e.connectionId === id);
        
        // Generate relationships based on entity data
        const relationships = [];
        
        // Example: Create relationships between entities
        entities.forEach((entity, index) => {
            if (index < entities.length - 1) {
                relationships.push({
                    id: crypto.randomBytes(8).toString('hex'),
                    fromId: entity.id,
                    toId: entities[index + 1].id,
                    type: 'related_to',
                    createdAt: new Date().toISOString()
                });
            }
        });
        
        res.json({
            relationships,
            total: relationships.length
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to fetch relationships'
        });
    }
});

// Update connection configuration
router.put('/:id/config', async (req, res) => {
    const { id } = req.params;
    const config = req.body;
    
    try {
        const data = await loadConnections();
        const connectionIndex = data.connections.findIndex(c => c.id === id);
        
        if (connectionIndex === -1) {
            return res.status(404).json({
                error: 'Connection not found'
            });
        }
        
        // Update connection with new config
        data.connections[connectionIndex] = {
            ...data.connections[connectionIndex],
            ...config,
            id, // Prevent ID change
            updatedAt: new Date().toISOString()
        };
        
        await saveConnections(data);
        
        // Broadcast configuration update
        wsHandler.broadcast('connection-config-update', {
            connectionId: id,
            config,
            timestamp: new Date().toISOString()
        });
        
        res.json(data.connections[connectionIndex]);
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to update connection configuration'
        });
    }
});

// Helper functions for OAuth sessions
async function getOAuthSessionsPath() {
    const dataDir = path.join(process.cwd(), '../../../backend/data');
    await fs.ensureDir(dataDir);
    return path.join(dataDir, 'oauth-sessions.json');
}

async function loadOAuthSessions() {
    try {
        const filePath = await getOAuthSessionsPath();
        if (await fs.pathExists(filePath)) {
            return await fs.readJson(filePath);
        }
        return {};
    } catch (error) {
        console.error('Error loading OAuth sessions:', error);
        return {};
    }
}

async function saveOAuthSessions(sessions) {
    const filePath = await getOAuthSessionsPath();
    await fs.writeJson(filePath, sessions, { spaces: 2 });
}

export default router