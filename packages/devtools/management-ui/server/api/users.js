import express from 'express'
import path from 'path'
import fs from 'fs-extra'
import crypto from 'crypto'
import { createStandardResponse, createErrorResponse, ERROR_CODES, asyncHandler } from '../utils/response.js'
import { wsHandler } from '../websocket/handler.js'
import simulationRouter from './users/simulation.js'
import sessionsRouter from './users/sessions.js'

const router = express.Router();

// Mount sub-routes
router.use('/simulation', simulationRouter);
router.use('/sessions', sessionsRouter);

// Helper to get users data file path
async function getUsersFilePath() {
    const dataDir = path.join(process.cwd(), '../../../backend/data');
    await fs.ensureDir(dataDir);
    return path.join(dataDir, 'dummy-users.json');
}

// Helper to load users
async function loadUsers() {
    try {
        const filePath = await getUsersFilePath();
        if (await fs.pathExists(filePath)) {
            return await fs.readJson(filePath);
        }
        return { users: [] };
    } catch (error) {
        console.error('Error loading users:', error);
        return { users: [] };
    }
}

// Helper to save users
async function saveUsers(data) {
    const filePath = await getUsersFilePath();
    await fs.writeJson(filePath, data, { spaces: 2 });
}

// Helper to generate dummy user data
function generateDummyUser(data = {}) {
    const id = data.id || crypto.randomBytes(16).toString('hex');
    const firstName = data.firstName || 'Test';
    const lastName = data.lastName || 'User';
    const email = data.email || `user_${Date.now()}@example.com`;
    
    return {
        id,
        appUserId: data.appUserId || `app_user_${crypto.randomBytes(8).toString('hex')}`,
        appOrgId: data.appOrgId || `app_org_${crypto.randomBytes(8).toString('hex')}`,
        firstName,
        lastName,
        email,
        username: data.username || email.split('@')[0],
        avatar: data.avatar || `https://ui-avatars.com/api/?name=${firstName}+${lastName}`,
        role: data.role || 'user',
        status: data.status || 'active',
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: data.metadata || {},
        connections: data.connections || []
    };
}

// Get all users
router.get('/', async (req, res) => {
    try {
        const { page = 1, limit = 10, search, role, status } = req.query;
        const data = await loadUsers();
        let users = data.users || [];
        
        // Apply filters
        if (search) {
            const searchLower = search.toLowerCase();
            users = users.filter(user => 
                user.email.toLowerCase().includes(searchLower) ||
                user.firstName.toLowerCase().includes(searchLower) ||
                user.lastName.toLowerCase().includes(searchLower) ||
                user.username.toLowerCase().includes(searchLower)
            );
        }
        
        if (role) {
            users = users.filter(user => user.role === role);
        }
        
        if (status) {
            users = users.filter(user => user.status === status);
        }
        
        // Pagination
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + parseInt(limit);
        const paginatedUsers = users.slice(startIndex, endIndex);
        
        res.json({
            users: paginatedUsers,
            total: users.length,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(users.length / limit)
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to fetch users'
        });
    }
});

// Get single user
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        const data = await loadUsers();
        const user = data.users.find(u => u.id === id);
        
        if (!user) {
            return res.status(404).json({
                error: 'User not found'
            });
        }
        
        res.json(user);
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to fetch user'
        });
    }
});

// Create new user
router.post('/', async (req, res) => {
    try {
        const userData = req.body;
        const newUser = generateDummyUser(userData);
        
        const data = await loadUsers();
        
        // Check if email already exists
        if (data.users.some(u => u.email === newUser.email)) {
            return res.status(400).json({
                error: 'Email already exists'
            });
        }
        
        data.users.push(newUser);
        await saveUsers(data);
        
        // Broadcast user creation
        wsHandler.broadcast('user-update', {
            action: 'created',
            user: newUser,
            timestamp: new Date().toISOString()
        });
        
        res.status(201).json(newUser);
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to create user'
        });
    }
});

// Update user
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    
    try {
        const data = await loadUsers();
        const userIndex = data.users.findIndex(u => u.id === id);
        
        if (userIndex === -1) {
            return res.status(404).json({
                error: 'User not found'
            });
        }
        
        // Update user
        const updatedUser = {
            ...data.users[userIndex],
            ...updates,
            id, // Prevent ID from being changed
            updatedAt: new Date().toISOString()
        };
        
        data.users[userIndex] = updatedUser;
        await saveUsers(data);
        
        // Broadcast user update
        wsHandler.broadcast('user-update', {
            action: 'updated',
            user: updatedUser,
            timestamp: new Date().toISOString()
        });
        
        res.json(updatedUser);
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to update user'
        });
    }
});

// Delete user
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        const data = await loadUsers();
        const userIndex = data.users.findIndex(u => u.id === id);
        
        if (userIndex === -1) {
            return res.status(404).json({
                error: 'User not found'
            });
        }
        
        const deletedUser = data.users[userIndex];
        data.users.splice(userIndex, 1);
        await saveUsers(data);
        
        // Broadcast user deletion
        wsHandler.broadcast('user-update', {
            action: 'deleted',
            userId: id,
            timestamp: new Date().toISOString()
        });
        
        res.json({
            status: 'success',
            message: 'User deleted',
            user: deletedUser
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to delete user'
        });
    }
});

// Bulk create users
router.post('/bulk', async (req, res) => {
    const { count = 10 } = req.body;
    
    try {
        const data = await loadUsers();
        const newUsers = [];
        
        for (let i = 0; i < count; i++) {
            const user = generateDummyUser({
                firstName: `Test${i + 1}`,
                lastName: `User${i + 1}`,
                email: `test.user${i + 1}_${Date.now()}@example.com`,
                role: i % 3 === 0 ? 'admin' : 'user',
                status: i % 5 === 0 ? 'inactive' : 'active',
                appUserId: `app_user_test_${i + 1}`,
                appOrgId: `app_org_${Math.floor(i / 5) + 1}` // Group users into orgs
            });
            newUsers.push(user);
        }
        
        data.users.push(...newUsers);
        await saveUsers(data);
        
        // Broadcast bulk creation
        wsHandler.broadcast('user-update', {
            action: 'bulk-created',
            count: newUsers.length,
            timestamp: new Date().toISOString()
        });
        
        res.json({
            status: 'success',
            message: `Created ${count} dummy users`,
            users: newUsers
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to create bulk users'
        });
    }
});

// Delete all users
router.delete('/', async (req, res) => {
    try {
        await saveUsers({ users: [] });
        
        // Broadcast deletion
        wsHandler.broadcast('user-update', {
            action: 'all-deleted',
            timestamp: new Date().toISOString()
        });
        
        res.json({
            status: 'success',
            message: 'All users deleted'
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to delete all users'
        });
    }
});

// User statistics
router.get('/stats/summary', async (req, res) => {
    try {
        const data = await loadUsers();
        const users = data.users || [];
        
        const stats = {
            total: users.length,
            byRole: {},
            byStatus: {},
            recentlyCreated: 0,
            recentlyUpdated: 0
        };
        
        const now = new Date();
        const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
        
        users.forEach(user => {
            // Count by role
            stats.byRole[user.role] = (stats.byRole[user.role] || 0) + 1;
            
            // Count by status
            stats.byStatus[user.status] = (stats.byStatus[user.status] || 0) + 1;
            
            // Count recently created
            if (new Date(user.createdAt) > dayAgo) {
                stats.recentlyCreated++;
            }
            
            // Count recently updated
            if (new Date(user.updatedAt) > dayAgo) {
                stats.recentlyUpdated++;
            }
        });
        
        res.json(stats);
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to get user statistics'
        });
    }
});

export default router