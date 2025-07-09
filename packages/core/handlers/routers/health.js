const { Router } = require('express');
const mongoose = require('mongoose');
const https = require('https');
const http = require('http');
const { moduleFactory, integrationFactory } = require('./../backend-utils');
const { createAppHandler } = require('./../app-handler-helpers');
const { version } = require('../../package.json');

const router = Router();

// Utility function to check external API connectivity
const checkExternalAPI = (url, timeout = 5000) => {
    return new Promise((resolve) => {
        const protocol = url.startsWith('https:') ? https : http;
        const startTime = Date.now();
        
        try {
            const request = protocol.get(url, { timeout }, (res) => {
                const responseTime = Date.now() - startTime;
                resolve({
                    status: 'healthy',
                    statusCode: res.statusCode,
                    responseTime,
                    reachable: res.statusCode < 500
                });
            });

            request.on('error', (error) => {
                resolve({
                    status: 'unhealthy',
                    error: error.message,
                    responseTime: Date.now() - startTime,
                    reachable: false
                });
            });

            request.on('timeout', () => {
                request.destroy();
                resolve({
                    status: 'timeout',
                    error: 'Request timeout',
                    responseTime: timeout,
                    reachable: false
                });
            });
        } catch (error) {
            resolve({
                status: 'error',
                error: error.message,
                responseTime: Date.now() - startTime,
                reachable: false
            });
        }
    });
};

// Simple health check - no authentication required
router.get('/health', async (req, res) => {
    const status = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'frigg-core-api',
        version
    };

    res.status(200).json(status);
});

// Detailed health check with component status
router.get('/health/detailed', async (req, res) => {
    const startTime = Date.now();
    const checks = {
        service: 'frigg-core-api',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version,
        uptime: process.uptime(),
        checks: {}
    };

    // Check database connectivity
    try {
        const dbState = mongoose.connection.readyState;
        const dbStateMap = {
            0: 'disconnected',
            1: 'connected',
            2: 'connecting',
            3: 'disconnecting'
        };
        
        checks.checks.database = {
            status: dbState === 1 ? 'healthy' : 'unhealthy',
            state: dbStateMap[dbState],
            type: 'mongodb'
        };

        // If connected, check database responsiveness
        if (dbState === 1) {
            const pingStart = Date.now();
            await mongoose.connection.db.admin().ping();
            checks.checks.database.responseTime = Date.now() - pingStart;
        }
    } catch (error) {
        checks.checks.database = {
            status: 'unhealthy',
            error: error.message,
            type: 'mongodb'
        };
        checks.status = 'degraded';
    }

    // Check external API connectivity (example endpoints)
    const externalAPIs = [
        { name: 'github', url: 'https://api.github.com/status' },
        { name: 'npm', url: 'https://registry.npmjs.org' }
    ];

    checks.checks.external_apis = {};
    
    for (const api of externalAPIs) {
        checks.checks.external_apis[api.name] = await checkExternalAPI(api.url);
        if (!checks.checks.external_apis[api.name].reachable) {
            checks.status = 'degraded';
        }
    }

    // Check available integrations
    try {
        const availableModules = moduleFactory.getAll();
        const availableIntegrations = integrationFactory.getAll();
        
        checks.checks.integrations = {
            status: 'healthy',
            modules: {
                count: Object.keys(availableModules).length,
                available: Object.keys(availableModules)
            },
            integrations: {
                count: Object.keys(availableIntegrations).length,
                available: Object.keys(availableIntegrations)
            }
        };
    } catch (error) {
        checks.checks.integrations = {
            status: 'unhealthy',
            error: error.message
        };
        checks.status = 'degraded';
    }

    // Memory usage
    const memoryUsage = process.memoryUsage();
    checks.checks.memory = {
        status: 'healthy',
        rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB',
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB',
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB',
        external: Math.round(memoryUsage.external / 1024 / 1024) + ' MB'
    };

    // Overall response time
    checks.responseTime = Date.now() - startTime;

    // Set appropriate status code
    const statusCode = checks.status === 'healthy' ? 200 : 
                      checks.status === 'degraded' ? 200 : 503;

    res.status(statusCode).json(checks);
});

// Liveness probe - for k8s/container orchestration
router.get('/health/live', (req, res) => {
    res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString()
    });
});

// Readiness probe - checks if service is ready to receive traffic
router.get('/health/ready', async (req, res) => {
    const checks = {
        ready: true,
        timestamp: new Date().toISOString(),
        checks: {}
    };

    // Check database is connected
    const dbState = mongoose.connection.readyState;
    checks.checks.database = dbState === 1;
    
    // Check critical services are loaded
    try {
        const modules = moduleFactory.getAll();
        checks.checks.modules = Object.keys(modules).length > 0;
    } catch (error) {
        checks.checks.modules = false;
    }

    // Determine overall readiness
    checks.ready = checks.checks.database && checks.checks.modules;

    const statusCode = checks.ready ? 200 : 503;
    res.status(statusCode).json(checks);
});

const handler = createAppHandler('HTTP Event: Health', router);

module.exports = { handler, router };