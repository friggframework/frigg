const express = require('express');
const catchAsyncError = require('express-async-handler');
const Boom = require('@hapi/boom');
const IntegrationDiscoveryService = require('../../integrations/discovery/integration-discovery-service');
const IntegrationInstallerService = require('../../integrations/discovery/integration-installer-service');
const { debug, info } = require('../../logs');

function createIntegrationDiscoveryRouter(params = {}) {
    const router = express.Router();
    const requireLoggedInUser = params.requireLoggedInUser || ((req, res, next) => next());
    
    // Initialize services
    const discoveryService = new IntegrationDiscoveryService();
    const installerService = new IntegrationInstallerService(params.projectRoot);

    // Protect all discovery routes
    router.all('/api/discovery/*', requireLoggedInUser);

    /**
     * Search for available integrations
     * GET /api/discovery/search?query=hubspot&limit=20&offset=0
     */
    router.get('/api/discovery/search', 
        catchAsyncError(async (req, res) => {
            const { query = '', limit = 20, offset = 0 } = req.query;
            
            debug(`Searching integrations: query="${query}", limit=${limit}, offset=${offset}`);
            
            const results = await discoveryService.searchIntegrations({
                query,
                limit: parseInt(limit, 10),
                offset: parseInt(offset, 10)
            });

            res.json({
                success: true,
                data: results
            });
        })
    );

    /**
     * Get all available integrations categorized
     * GET /api/discovery/integrations
     */
    router.get('/api/discovery/integrations',
        catchAsyncError(async (req, res) => {
            debug('Fetching all available integrations');
            
            const integrations = await discoveryService.getAllIntegrations();

            res.json({
                success: true,
                data: integrations
            });
        })
    );

    /**
     * Get detailed information about a specific integration
     * GET /api/discovery/integrations/:packageName
     */
    router.get('/api/discovery/integrations/:packageName',
        catchAsyncError(async (req, res) => {
            const { packageName } = req.params;
            
            if (!packageName.startsWith('@friggframework/')) {
                throw Boom.badRequest('Invalid package name');
            }

            debug(`Getting integration details for: ${packageName}`);
            
            const details = await discoveryService.getIntegrationDetails(packageName);

            res.json({
                success: true,
                data: details
            });
        })
    );

    /**
     * Get installed integrations
     * GET /api/discovery/installed
     */
    router.get('/api/discovery/installed',
        catchAsyncError(async (req, res) => {
            debug('Getting installed integrations');
            
            const installed = await installerService.getInstalledIntegrations();

            res.json({
                success: true,
                data: installed
            });
        })
    );

    /**
     * Install an integration
     * POST /api/discovery/install
     * Body: { packageName: "@friggframework/api-module-hubspot", options: { ... } }
     */
    router.post('/api/discovery/install',
        catchAsyncError(async (req, res) => {
            const { packageName, options = {} } = req.body;

            if (!packageName) {
                throw Boom.badRequest('Package name is required');
            }

            if (!packageName.startsWith('@friggframework/')) {
                throw Boom.badRequest('Invalid package name');
            }

            info(`Installing integration: ${packageName}`);
            
            const result = await installerService.installIntegration(packageName, options);

            res.json({
                success: true,
                data: result
            });
        })
    );

    /**
     * Uninstall an integration
     * DELETE /api/discovery/uninstall/:packageName
     */
    router.delete('/api/discovery/uninstall/:packageName',
        catchAsyncError(async (req, res) => {
            const { packageName } = req.params;

            if (!packageName.startsWith('@friggframework/')) {
                throw Boom.badRequest('Invalid package name');
            }

            info(`Uninstalling integration: ${packageName}`);
            
            const result = await installerService.uninstallIntegration(packageName);

            res.json({
                success: true,
                data: result
            });
        })
    );

    /**
     * Update an integration to the latest version
     * POST /api/discovery/update
     * Body: { packageName: "@friggframework/api-module-hubspot" }
     */
    router.post('/api/discovery/update',
        catchAsyncError(async (req, res) => {
            const { packageName } = req.body;

            if (!packageName) {
                throw Boom.badRequest('Package name is required');
            }

            if (!packageName.startsWith('@friggframework/')) {
                throw Boom.badRequest('Invalid package name');
            }

            info(`Updating integration: ${packageName}`);
            
            const result = await installerService.updateIntegration(packageName);

            res.json({
                success: true,
                data: result
            });
        })
    );

    /**
     * Check health/availability of an integration
     * GET /api/discovery/health/:packageName
     */
    router.get('/api/discovery/health/:packageName',
        catchAsyncError(async (req, res) => {
            const { packageName } = req.params;

            if (!packageName.startsWith('@friggframework/')) {
                throw Boom.badRequest('Invalid package name');
            }

            debug(`Checking health for: ${packageName}`);

            // Check if installed
            const isInstalled = await installerService.isIntegrationInstalled(packageName);
            
            // Get package details from npm
            let npmDetails = null;
            try {
                npmDetails = await discoveryService.getIntegrationDetails(packageName);
            } catch (err) {
                // Package might not exist on npm
            }

            const health = {
                packageName,
                installed: isInstalled,
                available: !!npmDetails,
                version: isInstalled ? await installerService.getInstalledVersion(packageName) : null,
                latestVersion: npmDetails?.version || null,
                updateAvailable: false
            };

            // Check if update is available
            if (health.installed && health.version && health.latestVersion) {
                health.updateAvailable = health.version !== health.latestVersion;
            }

            res.json({
                success: true,
                data: health
            });
        })
    );

    /**
     * Get integration categories
     * GET /api/discovery/categories
     */
    router.get('/api/discovery/categories',
        catchAsyncError(async (req, res) => {
            debug('Getting integration categories');

            // Define available categories
            const categories = [
                { id: 'crm', name: 'CRM', icon: 'users' },
                { id: 'communication', name: 'Communication', icon: 'message-circle' },
                { id: 'ecommerce', name: 'E-commerce', icon: 'shopping-cart' },
                { id: 'marketing', name: 'Marketing', icon: 'megaphone' },
                { id: 'productivity', name: 'Productivity', icon: 'check-square' },
                { id: 'analytics', name: 'Analytics', icon: 'bar-chart' },
                { id: 'support', name: 'Support', icon: 'help-circle' },
                { id: 'finance', name: 'Finance', icon: 'dollar-sign' },
                { id: 'developer-tools', name: 'Developer Tools', icon: 'code' },
                { id: 'social-media', name: 'Social Media', icon: 'share-2' },
                { id: 'other', name: 'Other', icon: 'grid' }
            ];

            res.json({
                success: true,
                data: categories
            });
        })
    );

    /**
     * Clear discovery cache
     * POST /api/discovery/cache/clear
     */
    router.post('/api/discovery/cache/clear',
        catchAsyncError(async (req, res) => {
            debug('Clearing discovery cache');
            
            discoveryService.clearCache();

            res.json({
                success: true,
                message: 'Cache cleared successfully'
            });
        })
    );

    return router;
}

module.exports = { createIntegrationDiscoveryRouter };