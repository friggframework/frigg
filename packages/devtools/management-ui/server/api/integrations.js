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

async function getAvailableIntegrations() {
    try {
        // Search NPM registry for @friggframework/api-module-* packages
        const searchUrl = 'https://registry.npmjs.org/-/v1/search?text=@friggframework%20api-module&size=100';
        
        const response = await fetch(searchUrl);
        if (!response.ok) {
            throw new Error(`NPM search failed: ${response.statusText}`);
        }

        const data = await response.json();
        
        // Filter and format integration packages
        const integrations = data.objects
            .filter(pkg => pkg.package.name.includes('@friggframework/api-module-'))
            .map(pkg => ({
                name: pkg.package.name,
                version: pkg.package.version,
                description: pkg.package.description || 'No description available',
                category: detectCategory(pkg.package.name, pkg.package.description || '', pkg.package.keywords || []),
                installed: false,
                tags: pkg.package.keywords || [],
                npmUrl: `https://www.npmjs.com/package/${pkg.package.name}`
            }));

        console.log(`Found ${integrations.length} available integrations from NPM`);
        return integrations;
    } catch (error) {
        console.error('Error fetching integrations from NPM:', error);
        // Fallback to basic list if NPM search fails
        return [
            {
                name: '@friggframework/api-module-hubspot',
                version: 'latest',
                description: 'HubSpot CRM integration for Frigg',
                category: 'CRM',
                installed: false
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
                                    name: config.name || serviceName.toLowerCase(),
                                    displayName: display.name || serviceName,
                                    description: display.description || `${serviceName} integration`,
                                    category: display.category || detectCategory(serviceName.toLowerCase(), display.description || '', []),
                                    version: config.version || '1.0.0',
                                    installed: true,
                                    status: 'active',
                                    type: 'integration',
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
                                    name: `unknown-${index}`,
                                    displayName: `Unknown Integration ${index}`,
                                    description: 'Error processing integration',
                                    category: 'Other',
                                    installed: true,
                                    status: 'error',
                                    type: 'integration',
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
        
        // Look for integration imports and uses
        const importMatches = backendContent.match(/import.*Integration.*from.*@friggframework/g) || [];
        const classMatches = backendContent.match(/class.*Integration/g) || [];
        const allMatches = [...importMatches, ...classMatches];
        
        for (const match of allMatches) {
            const nameMatch = match.match(/(\w+Integration)/);
            if (nameMatch) {
                const integrationName = nameMatch[1];
                const serviceName = integrationName.replace('Integration', '');
                
                // Check if this integration is in the integrations array
                if (backendContent.includes(integrationName)) {
                    integrations.push({
                        name: serviceName.toLowerCase(),
                        displayName: serviceName,
                        description: `${serviceName} integration`,
                        category: detectCategory(serviceName.toLowerCase(), '', []),
                        installed: true,
                        status: 'active',
                        type: 'integration',
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

// List all integrations
router.get('/', async (req, res) => {
    try {
        const [availableApiModules, installedIntegrations] = await Promise.all([
            getAvailableIntegrations(),
            getInstalledIntegrations()
        ]);

        // Format available API modules (not yet integrations)
        const formattedAvailable = availableApiModules.map(apiModule => ({
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

        res.json({
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
                : 'No integrations found in backend appDefinition'
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to fetch integrations'
        });
    }
});

// Install an integration
router.post('/install', async (req, res) => {
    const { packageName } = req.body;

    if (!packageName) {
        return res.status(400).json({
            error: 'Package name is required'
        });
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

        res.json({
            status: 'success',
            message: `Integration ${packageName} installed successfully`,
            output: stdout
        });

    } catch (error) {
        // Broadcast error
        wsHandler.broadcast('integration-install', {
            status: 'error',
            packageName,
            message: `Failed to install ${packageName}`,
            error: error.message
        });

        res.status(500).json({
            error: error.message,
            details: 'Failed to install integration',
            stderr: error.stderr
        });
    }
});

// Configure an integration
router.post('/:integrationName/configure', async (req, res) => {
    const { integrationName } = req.params;
    const { config } = req.body;

    try {
        // This would typically update the integration configuration
        // For now, we'll store it in a config file
        const configPath = path.join(
            process.cwd(),
            '../../../backend',
            'config',
            'integrations',
            `${integrationName}.json`
        );

        await fs.ensureDir(path.dirname(configPath));
        await fs.writeJson(configPath, config, { spaces: 2 });

        res.json({
            status: 'success',
            message: `Configuration saved for ${integrationName}`,
            config
        });

    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to configure integration'
        });
    }
});

// Get integration configuration
router.get('/:integrationName/config', async (req, res) => {
    const { integrationName } = req.params;

    try {
        const configPath = path.join(
            process.cwd(),
            '../../../backend',
            'config',
            'integrations',
            `${integrationName}.json`
        );

        if (await fs.pathExists(configPath)) {
            const config = await fs.readJson(configPath);
            res.json({ config });
        } else {
            res.json({ config: {} });
        }

    } catch (error) {
        res.status(500).json({
            error: error.message,
            details: 'Failed to read integration configuration'
        });
    }
});

// Remove an integration
router.delete('/:integrationName', async (req, res) => {
    const { integrationName } = req.params;

    try {
        // Broadcast removal start
        wsHandler.broadcast('integration-remove', {
            status: 'removing',
            packageName: integrationName,
            message: `Removing ${integrationName}...`
        });

        // Remove the package
        const { stdout, stderr } = await execAsync(
            `npm uninstall ${integrationName}`,
            { cwd: path.join(process.cwd(), '../../../backend') }
        );

        // Remove config if exists
        const configPath = path.join(
            process.cwd(),
            '../../../backend',
            'config',
            'integrations',
            `${integrationName}.json`
        );
        
        if (await fs.pathExists(configPath)) {
            await fs.remove(configPath);
        }

        // Broadcast success
        wsHandler.broadcast('integration-remove', {
            status: 'removed',
            packageName: integrationName,
            message: `Successfully removed ${integrationName}`
        });

        res.json({
            status: 'success',
            message: `Integration ${integrationName} removed successfully`
        });

    } catch (error) {
        // Broadcast error
        wsHandler.broadcast('integration-remove', {
            status: 'error',
            packageName: integrationName,
            message: `Failed to remove ${integrationName}`,
            error: error.message
        });

        res.status(500).json({
            error: error.message,
            details: 'Failed to remove integration'
        });
    }
});

export { getInstalledIntegrations }
export default router