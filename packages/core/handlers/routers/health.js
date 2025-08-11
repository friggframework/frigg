const { Router } = require('express');
const mongoose = require('mongoose');
const https = require('https');
const http = require('http');
const { moduleFactory, integrationFactory } = require('./../backend-utils');
const { createAppHandler } = require('./../app-handler-helpers');

const router = Router();

const validateApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    
    if (req.path === '/health') {
        return next();
    }
    
    if (!apiKey || apiKey !== process.env.HEALTH_API_KEY) {
        return res.status(401).json({
            status: 'error',
            message: 'Unauthorized'
        });
    }
    
    next();
};

router.use(validateApiKey);

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

router.get('/health', async (_req, res) => {
    const status = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'frigg-core-api'
    };

    res.status(200).json(status);
});

router.get('/health/detailed', async (_req, res) => {
    const startTime = Date.now();
    const checks = {
        service: 'frigg-core-api',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        checks: {}
    };

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
            state: dbStateMap[dbState]
        };

        if (dbState === 1) {
            const pingStart = Date.now();
            await mongoose.connection.db.admin().ping({ maxTimeMS: 2000 });
            checks.checks.database.responseTime = Date.now() - pingStart;
        } else {
            checks.status = 'unhealthy';
        }
    } catch (error) {
        checks.checks.database = {
            status: 'unhealthy',
            error: error.message
        };
        checks.status = 'unhealthy';
    }

    const externalAPIs = [
        { name: 'github', url: 'https://api.github.com/status' },
        { name: 'npm', url: 'https://registry.npmjs.org' }
    ];

    checks.checks.externalApis = {};
    
    const apiChecks = await Promise.all(
        externalAPIs.map(api => 
            checkExternalAPI(api.url).then(result => ({ name: api.name, ...result }))
        )
    );
    
    apiChecks.forEach(result => {
        const { name, ...checkResult } = result;
        checks.checks.externalApis[name] = checkResult;
        if (!checkResult.reachable) {
            checks.status = 'unhealthy';
        }
    });

    try {
        const moduleTypes = Array.isArray(moduleFactory.moduleTypes)
            ? moduleFactory.moduleTypes
            : [];
        const integrationTypes = Array.isArray(
            integrationFactory.integrationTypes
        )
            ? integrationFactory.integrationTypes
            : [];

        checks.checks.integrations = {
            status: 'healthy',
            modules: {
                count: moduleTypes.length,
                available: moduleTypes,
            },
            integrations: {
                count: integrationTypes.length,
                available: integrationTypes,
            },
        };
    } catch (error) {
        checks.checks.integrations = {
            status: 'unhealthy',
            error: error.message
        };
        checks.status = 'unhealthy';
    }

    checks.responseTime = Date.now() - startTime;

    const statusCode = checks.status === 'healthy' ? 200 : 503;

    res.status(statusCode).json(checks);
});

router.get('/health/live', (_req, res) => {
    res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString()
    });
});

router.get('/health/ready', async (_req, res) => {
    const checks = {
        ready: true,
        timestamp: new Date().toISOString(),
        checks: {}
    };

    const dbState = mongoose.connection.readyState;
    checks.checks.database = dbState === 1;
    
    try {
        const moduleTypes = Array.isArray(moduleFactory.moduleTypes)
            ? moduleFactory.moduleTypes
            : [];
        checks.checks.modules = moduleTypes.length > 0;
    } catch (error) {
        checks.checks.modules = false;
    }

    checks.ready = checks.checks.database && checks.checks.modules;

    const statusCode = checks.ready ? 200 : 503;
    res.status(statusCode).json(checks);
});

const handler = createAppHandler('HTTP Event: Health', router);

module.exports = { handler, router };