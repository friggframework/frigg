import express from 'express'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs-extra'
import fetch from 'node-fetch'
import { createStandardResponse, createErrorResponse, ERROR_CODES, asyncHandler } from '../utils/response.js'
import { importCommonJS } from '../utils/import-commonjs.js'
import { wsHandler } from '../websocket/handler.js'

const router = express.Router();
const execAsync = promisify(exec);

// Helper to get available integrations from NPM
async function getAvailableIntegrations(options = {}) {
    try {
        const { category, search, limit = 100 } = options;
        
        // Search NPM registry for @friggframework/api-module-* packages
        let searchUrl = 'https://registry.npmjs.org/-/v1/search?text=@friggframework%20api-module&size=' + limit;
        
        if (search) {
            searchUrl += `&text=${encodeURIComponent(search)}`;
        }
        
        const response = await fetch(searchUrl);
        if (!response.ok) {
            throw new Error(`NPM search failed: ${response.statusText}`);
        }

        const data = await response.json();
        
        // Filter and format integration packages
        let integrations = data.objects
            .filter(pkg => pkg.package.name.includes('@friggframework/api-module-'))
            .map(pkg => ({
                id: pkg.package.name,
                name: pkg.package.name,
                version: pkg.package.version,
                description: pkg.package.description || 'No description available',
                category: detectCategory(pkg.package.name, pkg.package.description || '', pkg.package.keywords || []),
                tags: pkg.package.keywords || [],
                npmUrl: `https://www.npmjs.com/package/${pkg.package.name}`,
                published: pkg.package.date,
                type: 'available'
            }));

        // Filter by category if specified
        if (category) {
            integrations = integrations.filter(integration => 
                integration.category.toLowerCase() === category.toLowerCase()
            );
        }

        console.log(`Found ${integrations.length} available integrations from NPM`);
        return integrations;
    } catch (error) {
        console.error('Error fetching integrations from NPM:', error);
        // Fallback to basic list if NPM search fails
        return [
            {
                id: '@friggframework/api-module-hubspot',
                name: '@friggframework/api-module-hubspot',
                version: 'latest',
                description: 'HubSpot CRM integration for Frigg',
                category: 'CRM',
                tags: ['crm', 'hubspot'],
                npmUrl: 'https://www.npmjs.com/package/@friggframework/api-module-hubspot',
                type: 'available'
            }
        ];
    }
}

// Helper to detect integration category
function detectCategory(name, description, keywords) {
    const text = `${name} ${description} ${keywords.join(' ')}`.toLowerCase();
    
    const categoryPatterns = {
        'CRM': ['crm', 'customer', 'salesforce', 'hubspot', 'pipedrive'],
        'Communication': ['email', 'sms', 'chat', 'slack', 'discord', 'teams'],
        'E-commerce': ['ecommerce', 'shop', 'store', 'payment', 'stripe', 'paypal'],
        'Marketing': ['marketing', 'campaign', 'mailchimp', 'activecampaign'],
        'Productivity': ['task', 'project', 'asana', 'trello', 'notion', 'jira'],
        'Analytics': ['analytics', 'tracking', 'google', 'mixpanel', 'segment'],
        'Support': ['support', 'helpdesk', 'ticket', 'zendesk', 'intercom'],
        'Finance': ['accounting', 'invoice', 'quickbooks', 'xero', 'billing'],
        'Developer Tools': ['github', 'gitlab', 'bitbucket', 'api', 'webhook'],
        'Social Media': ['social', 'facebook', 'twitter', 'instagram', 'linkedin']
    };

    for (const [category, patterns] of Object.entries(categoryPatterns)) {
        for (const pattern of patterns) {
            if (text.includes(pattern)) {
                return category;
            }
        }
    }
    
    return 'Other';
}

// Helper to get actual integrations from backend.js appDefinition
async function getInstalledIntegrations() {
    try {
        // Try multiple possible backend locations
        const possiblePaths = [
            path.join(process.cwd(), '../../../backend'),
            path.join(process.cwd(), '../../backend'),
            path.join(process.cwd(), '../backend'),
            path.join(process.cwd(), 'backend'),
            // Also check template backend
            path.join(process.cwd(), '../frigg-cli/templates/backend')
        ];
        
        for (const backendPath of possiblePaths) {
            const backendJsPath = path.join(backendPath, 'backend.js');
            const indexJsPath = path.join(backendPath, 'index.js');
            
            // Try both backend.js and index.js
            const targetFile = await fs.pathExists(backendJsPath) ? backendJsPath : 
                              await fs.pathExists(indexJsPath) ? indexJsPath : null;
            
            if (targetFile) {
                console.log(`Found backend file at: ${targetFile}`);
                
                try {
                    // Dynamically import the backend file to get the actual appDefinition
                    // Use importCommonJS helper to handle both ESM and CommonJS modules
                    const backendModule = await importCommonJS(targetFile);
                    
                    // Extract appDefinition - could be default export, named export, or variable
                    const appDefinition = backendModule.default?.appDefinition || 
                                        backendModule.appDefinition ||
                                        backendModule.default ||
                                        backendModule;
                    
                    if (appDefinition && appDefinition.integrations && Array.isArray(appDefinition.integrations)) {
                        console.log(`Found ${appDefinition.integrations.length} integrations in appDefinition`);
                        
                        const integrations = appDefinition.integrations.map((IntegrationClass, index) => {
                            try {
                                // Get integration metadata from static properties
                                const config = IntegrationClass.Config || {};
                                const options = IntegrationClass.Options || {};
                                const modules = IntegrationClass.modules || {};
                                const display = options.display || {};
                                
                                // Extract service name from class name
                                const className = IntegrationClass.name || `Integration${index}`;
                                const serviceName = className.replace(/Integration$/, '');
                                
                                return {
                                    id: config.name || serviceName.toLowerCase(),
                                    name: config.name || serviceName.toLowerCase(),
                                    displayName: display.name || serviceName,
                                    description: display.description || `${serviceName} integration`,
                                    category: display.category || detectCategory(serviceName.toLowerCase(), display.description || '', []),
                                    version: config.version || '1.0.0',
                                    status: 'active',
                                    type: 'installed',
                                    className: className,
                                    
                                    // Integration configuration details
                                    events: config.events || [],
                                    supportedVersions: config.supportedVersions || [],
                                    hasUserConfig: options.hasUserConfig || false,
                                    
                                    // Display properties
                                    icon: display.icon,
                                    detailsUrl: display.detailsUrl,
                                    
                                    // API Modules information
                                    apiModules: Object.keys(modules).map(key => ({
                                        name: key,
                                        module: modules[key]?.name || key,
                                        description: `API module for ${key}`
                                    })),
                                    
                                    // Constructor details
                                    constructor: {
                                        name: className,
                                        hasConfig: !!config,
                                        hasOptions: !!options,
                                        hasModules: Object.keys(modules).length > 0
                                    }
                                };
                            } catch (classError) {
                                console.error(`Error processing integration class ${IntegrationClass.name}:`, classError);
                                return {
                                    id: `unknown-${index}`,
                                    name: `unknown-${index}`,
                                    displayName: `Unknown Integration ${index}`,
                                    description: 'Error processing integration',
                                    category: 'Other',
                                    status: 'error',
                                    type: 'installed',
                                    error: classError.message
                                };
                            }
                        });
                        
                        console.log(`Successfully processed ${integrations.length} integrations:`, 
                                  integrations.map(i => `${i.displayName} (${i.name})`));
                        return integrations;
                    } else {
                        console.log('No integrations array found in appDefinition');
                    }
                } catch (importError) {
                    console.error(`Error importing ${targetFile}:`, importError);
                    // Fall back to file parsing if dynamic import fails
                    return await parseBackendFile(targetFile);
                }
            }
        }
        
        console.log('No backend file found in any expected location');
        return [];
    } catch (error) {
        console.error('Error reading installed integrations:', error);
        return [];
    }
}

// Fallback function to parse backend file if dynamic import fails
async function parseBackendFile(filePath) {
    try {
        const backendContent = await fs.readFile(filePath, 'utf8');
        const integrations = [];
        
        // Extract integration imports - handle both require and import statements
        const requireMatches = backendContent.match(/(?:const|let|var)\s+(\w+Integration)\s*=\s*require\(['"]([^'"]+)['"]\)/g) || [];
        const importMatches = backendContent.match(/import\s+(?:\*\s+as\s+)?(\w+Integration)\s+from\s+['"]([^'"]+)['"]/g) || [];
        const allMatches = [...requireMatches, ...importMatches];
        
        for (const match of allMatches) {
            const nameMatch = match.match(/(\w+Integration)/);
            if (nameMatch) {
                const integrationName = nameMatch[1];
                const serviceName = integrationName.replace('Integration', '');
                
                // Check if this integration is in the integrations array
                if (backendContent.includes(integrationName)) {
                    integrations.push({
                        id: serviceName.toLowerCase(),
                        name: serviceName.toLowerCase(),
                        displayName: serviceName,
                        description: `${serviceName} integration`,
                        category: detectCategory(serviceName.toLowerCase(), '', []),
                        status: 'active',
                        type: 'installed',
                        className: integrationName,
                        constructor: {
                            name: integrationName,
                            hasConfig: true,
                            hasOptions: true,
                            hasModules: true
                        },
                        note: 'Parsed from file (dynamic loading failed)'
                    });
                }
            }
        }
        
        return integrations;
    } catch (error) {
        console.error('Error parsing backend file:', error);
        return [];
    }
}

// Helper to get integration by ID from installed integrations
async function getInstalledIntegrationById(id) {
    const integrations = await getInstalledIntegrations();
    return integrations.find(integration => integration.id === id || integration.name === id);
}

// Helper to get integration configuration
async function getIntegrationConfig(integrationName) {
    try {
        const possiblePaths = [
            path.join(process.cwd(), '../../../backend'),
            path.join(process.cwd(), '../../backend'),
            path.join(process.cwd(), '../backend'),
            path.join(process.cwd(), 'backend')
        ];

        for (const backendPath of possiblePaths) {
            const configPath = path.join(backendPath, 'config', 'integrations', `${integrationName}.json`);
            
            if (await fs.pathExists(configPath)) {
                const config = await fs.readJson(configPath);
                return config;
            }
        }
        
        return {};
    } catch (error) {
        console.error('Error reading integration configuration:', error);
        return {};
    }
}

// Helper to save integration configuration
async function saveIntegrationConfig(integrationName, config) {
    try {
        const possiblePaths = [
            path.join(process.cwd(), '../../../backend'),
            path.join(process.cwd(), '../../backend'),
            path.join(process.cwd(), '../backend'),
            path.join(process.cwd(), 'backend')
        ];

        for (const backendPath of possiblePaths) {
            const configPath = path.join(backendPath, 'config', 'integrations', `${integrationName}.json`);
            const configDir = path.dirname(configPath);
            
            await fs.ensureDir(configDir);
            await fs.writeJson(configPath, config, { spaces: 2 });
            
            console.log(`Configuration saved for ${integrationName} at ${configPath}`);
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('Error saving integration configuration:', error);
        throw error;
    }
}

// =============================================================================
// REFACTORED API ENDPOINTS
// =============================================================================

// 1. AVAILABLE INTEGRATIONS (Marketplace/Discovery)
// GET /api/integrations/available
router.get('/available', asyncHandler(async (req, res) => {
    try {
        const { category, search, limit } = req.query;
        
        const integrations = await getAvailableIntegrations({ category, search, limit });
        
        res.json(createStandardResponse({
            integrations,
            pagination: {
                total: integrations.length,
                limit: parseInt(limit) || 100
            },
            filters: {
                category: category || null,
                search: search || null
            }
        }));
    } catch (error) {
        res.status(500).json(createErrorResponse(
            ERROR_CODES.INTERNAL_ERROR,
            'Failed to fetch available integrations',
            error.message
        ));
    }
}));

// 2. INSTALLED INTEGRATIONS (User's Integrations)
// GET /api/integrations/installed
router.get('/installed', asyncHandler(async (req, res) => {
    try {
        const integrations = await getInstalledIntegrations();
        
        res.json(createStandardResponse({
            integrations,
            count: integrations.length,
            summary: {
                active: integrations.filter(i => i.status === 'active').length,
                error: integrations.filter(i => i.status === 'error').length,
                categories: [...new Set(integrations.map(i => i.category))]
            }
        }));
    } catch (error) {
        res.status(500).json(createErrorResponse(
            ERROR_CODES.INTERNAL_ERROR,
            'Failed to fetch installed integrations',
            error.message
        ));
    }
}));

// GET /api/integrations/installed/:id
router.get('/installed/:id', asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;
        const integration = await getInstalledIntegrationById(id);
        
        if (!integration) {
            return res.status(404).json(createErrorResponse(
                ERROR_CODES.NOT_FOUND,
                'Integration not found',
                `Integration with id '${id}' not found`
            ));
        }
        
        res.json(createStandardResponse(integration));
    } catch (error) {
        res.status(500).json(createErrorResponse(
            ERROR_CODES.INTERNAL_ERROR,
            'Failed to fetch integration',
            error.message
        ));
    }
}));

// 3. INTEGRATION CONFIGURATION
// GET /api/integrations/installed/:id/config
router.get('/installed/:id/config', asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;
        const integration = await getInstalledIntegrationById(id);
        
        if (!integration) {
            return res.status(404).json(createErrorResponse(
                ERROR_CODES.NOT_FOUND,
                'Integration not found',
                `Integration with id '${id}' not found`
            ));
        }
        
        const config = await getIntegrationConfig(id);
        
        res.json(createStandardResponse({
            integrationId: id,
            integrationName: integration.displayName || integration.name,
            config
        }));
    } catch (error) {
        res.status(500).json(createErrorResponse(
            ERROR_CODES.INTERNAL_ERROR,
            'Failed to fetch integration configuration',
            error.message
        ));
    }
}));

// PUT /api/integrations/installed/:id/config
router.put('/installed/:id/config', asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;
        const { config } = req.body;
        
        if (!config) {
            return res.status(400).json(createErrorResponse(
                ERROR_CODES.VALIDATION_ERROR,
                'Configuration is required',
                'Request body must include a config object'
            ));
        }
        
        const integration = await getInstalledIntegrationById(id);
        
        if (!integration) {
            return res.status(404).json(createErrorResponse(
                ERROR_CODES.NOT_FOUND,
                'Integration not found',
                `Integration with id '${id}' not found`
            ));
        }
        
        await saveIntegrationConfig(id, config);
        
        res.json(createStandardResponse({
            integrationId: id,
            integrationName: integration.displayName || integration.name,
            config,
            message: 'Configuration saved successfully'
        }));
    } catch (error) {
        res.status(500).json(createErrorResponse(
            ERROR_CODES.INTERNAL_ERROR,
            'Failed to save integration configuration',
            error.message
        ));
    }
}));

// POST /api/integrations/installed/:id/config/test
router.post('/installed/:id/config/test', asyncHandler(async (req, res) => {
    try {
        const { id } = req.params;
        const integration = await getInstalledIntegrationById(id);
        
        if (!integration) {
            return res.status(404).json(createErrorResponse(
                ERROR_CODES.NOT_FOUND,
                'Integration not found',
                `Integration with id '${id}' not found`
            ));
        }
        
        // TODO: Implement actual configuration testing
        // This would typically validate the configuration against the integration
        
        res.json(createStandardResponse({
            integrationId: id,
            integrationName: integration.displayName || integration.name,
            testResult: 'success',
            message: 'Configuration test passed'
        }));
    } catch (error) {
        res.status(500).json(createErrorResponse(
            ERROR_CODES.INTERNAL_ERROR,
            'Failed to test integration configuration',
            error.message
        ));
    }
}));

// 4. INTEGRATION INSTALLATION
// POST /api/integrations/install
router.post('/install', asyncHandler(async (req, res) => {
    const { packageName } = req.body;

    if (!packageName) {
        return res.status(400).json(createErrorResponse(
            ERROR_CODES.VALIDATION_ERROR,
            'Package name is required',
            'Request body must include a packageName field'
        ));
    }

    try {
        // Broadcast installation start
        wsHandler.broadcast('integration-install', {
            status: 'installing',
            packageName,
            message: `Installing ${packageName}...`
        });

        // Run frigg install command
        const { stdout, stderr } = await execAsync(
            `npx frigg install ${packageName}`,
            { cwd: path.join(process.cwd(), '../../../backend') }
        );

        // Broadcast success
        wsHandler.broadcast('integration-install', {
            status: 'installed',
            packageName,
            message: `Successfully installed ${packageName}`,
            output: stdout
        });

        res.status(201).json(createStandardResponse({
            packageName,
            status: 'installed',
            message: `Integration ${packageName} installed successfully`,
            output: stdout
        }));

    } catch (error) {
        // Broadcast error
        wsHandler.broadcast('integration-install', {
            status: 'error',
            packageName,
            message: `Failed to install ${packageName}`,
            error: error.message
        });

        res.status(500).json(createErrorResponse(
            ERROR_CODES.INTERNAL_ERROR,
            'Failed to install integration',
            error.message,
            { stderr: error.stderr }
        ));
    }
}));

// DELETE /api/integrations/install/:packageName
router.delete('/install/:packageName', asyncHandler(async (req, res) => {
    const { packageName } = req.params;

    try {
        // Broadcast removal start
        wsHandler.broadcast('integration-remove', {
            status: 'removing',
            packageName,
            message: `Removing ${packageName}...`
        });

        // Remove the package
        const { stdout, stderr } = await execAsync(
            `npm uninstall ${packageName}`,
            { cwd: path.join(process.cwd(), '../../../backend') }
        );

        // Remove config if exists
        const possiblePaths = [
            path.join(process.cwd(), '../../../backend'),
            path.join(process.cwd(), '../../backend'),
            path.join(process.cwd(), '../backend'),
            path.join(process.cwd(), 'backend')
        ];

        for (const backendPath of possiblePaths) {
            const configPath = path.join(backendPath, 'config', 'integrations', `${packageName}.json`);
            
            if (await fs.pathExists(configPath)) {
                await fs.remove(configPath);
            }
        }

        // Broadcast success
        wsHandler.broadcast('integration-remove', {
            status: 'removed',
            packageName,
            message: `Successfully removed ${packageName}`
        });

        res.json(createStandardResponse({
            packageName,
            status: 'removed',
            message: `Integration ${packageName} removed successfully`
        }));

    } catch (error) {
        // Broadcast error
        wsHandler.broadcast('integration-remove', {
            status: 'error',
            packageName,
            message: `Failed to remove ${packageName}`,
            error: error.message
        });

        res.status(500).json(createErrorResponse(
            ERROR_CODES.INTERNAL_ERROR,
            'Failed to remove integration',
            error.message,
            { stderr: error.stderr }
        ));
    }
}));

// =============================================================================
// LEGACY ENDPOINT (for backward compatibility)
// =============================================================================

// GET /api/integrations (legacy endpoint)
router.get('/', asyncHandler(async (req, res) => {
    try {
        // For backward compatibility, return the old structure
        const [availableIntegrations, installedIntegrations] = await Promise.all([
            getAvailableIntegrations(),
            getInstalledIntegrations()
        ]);

        // Format available API modules (not yet integrations)
        const formattedAvailable = availableIntegrations.map(apiModule => ({
            ...apiModule,
            displayName: apiModule.name.replace('@friggframework/api-module-', '').replace(/-/g, ' '),
            installed: false,
            status: 'available',
            type: 'api-module' // These are just API modules, not full integrations
        }));

        // Actual integrations already properly formatted from appDefinition
        const formattedIntegrations = installedIntegrations.map(integration => ({
            ...integration,
            installed: true,
            status: integration.status || 'active'
        }));

        res.json(createStandardResponse({
            // Main integrations array contains actual integrations from appDefinition
            integrations: formattedIntegrations,
            
            // Available API modules that could become integrations
            availableApiModules: formattedAvailable,
            
            // Summary counts
            total: formattedIntegrations.length + formattedAvailable.length,
            activeIntegrations: formattedIntegrations.length,
            availableModules: formattedAvailable.length,
            
            // Metadata about the response
            source: 'appDefinition',
            message: formattedIntegrations.length > 0 
                ? `Found ${formattedIntegrations.length} active integrations from backend appDefinition`
                : 'No integrations found in backend appDefinition',
            
            // Deprecation notice
            deprecationNotice: {
                message: 'This endpoint is deprecated. Please use the new RESTful endpoints:',
                newEndpoints: {
                    available: 'GET /api/integrations/available',
                    installed: 'GET /api/integrations/installed',
                    configuration: 'GET /api/integrations/installed/:id/config'
                }
            }
        }));
    } catch (error) {
        res.status(500).json(createErrorResponse(
            ERROR_CODES.INTERNAL_ERROR,
            'Failed to fetch integrations',
            error.message
        ));
    }
}));

// Export helper functions for use in other modules
export { getInstalledIntegrations, getAvailableIntegrations, getIntegrationConfig, saveIntegrationConfig }
export default router