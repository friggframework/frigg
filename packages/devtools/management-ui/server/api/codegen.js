import express from 'express';
import path from 'path';
import fs from 'fs-extra';
import TemplateEngine from '../services/template-engine.js';
import npmRegistry from '../services/npm-registry.js';

const router = express.Router();
const templateEngine = new TemplateEngine();

/**
 * Generate code from various types of configurations
 */
router.post('/generate', async (req, res) => {
    try {
        const { type, code, metadata, config } = req.body;

        if (!type) {
            return res.status(400).json({
                error: 'Generation type is required',
                validTypes: ['integration', 'api-endpoint', 'project-scaffold', 'custom']
            });
        }

        let result;
        
        switch (type) {
            case 'integration':
                result = await generateIntegration(config, req);
                break;
            case 'api-endpoint':
                result = await generateAPIEndpoints(config, req);
                break;
            case 'project-scaffold':
                result = await generateProjectScaffold(config, req);
                break;
            case 'custom':
                result = await generateCustomCode(code, metadata, req);
                break;
            default:
                return res.status(400).json({
                    error: `Unknown generation type: ${type}`,
                    validTypes: ['integration', 'api-endpoint', 'project-scaffold', 'custom']
                });
        }

        res.json(result);
    } catch (error) {
        console.error('Code generation error:', error);
        res.status(500).json({
            error: 'Code generation failed',
            message: error.message
        });
    }
});

/**
 * Get available templates
 */
router.get('/templates', async (req, res) => {
    try {
        const templates = await getAvailableTemplates();
        res.json(templates);
    } catch (error) {
        console.error('Error fetching templates:', error);
        res.status(500).json({
            error: 'Failed to fetch templates',
            message: error.message
        });
    }
});

/**
 * Preview generated code without writing files
 */
router.post('/preview', async (req, res) => {
    try {
        const { type, config } = req.body;

        let result;
        
        switch (type) {
            case 'integration':
                result = templateEngine.generateIntegration(config);
                break;
            case 'api-endpoint':
                result = templateEngine.generateAPIEndpoints(config);
                break;
            case 'project-scaffold':
                result = templateEngine.generateProjectScaffold(config);
                break;
            default:
                return res.status(400).json({
                    error: `Preview not available for type: ${type}`
                });
        }

        // Return only file contents for preview
        res.json({
            files: result.files.map(file => ({
                name: file.name,
                content: file.content,
                size: file.content.length
            })),
            metadata: result.metadata
        });
    } catch (error) {
        console.error('Code preview error:', error);
        res.status(500).json({
            error: 'Code preview failed',
            message: error.message
        });
    }
});

/**
 * Validate configuration before generation
 */
router.post('/validate', async (req, res) => {
    try {
        const { type, config } = req.body;
        const errors = validateConfiguration(type, config);
        
        res.json({
            valid: errors.length === 0,
            errors
        });
    } catch (error) {
        console.error('Validation error:', error);
        res.status(500).json({
            error: 'Validation failed',
            message: error.message
        });
    }
});

/**
 * Get CLI status and capabilities
 */
router.get('/cli-status', async (req, res) => {
    try {
        const status = await getCLIStatus();
        res.json(status);
    } catch (error) {
        console.error('CLI status error:', error);
        res.status(500).json({
            error: 'Failed to get CLI status',
            message: error.message
        });
    }
});

/**
 * Execute CLI command
 */
router.post('/cli-execute', async (req, res) => {
    try {
        const { command, args, workingDirectory } = req.body;
        
        if (!command) {
            return res.status(400).json({
                error: 'Command is required'
            });
        }

        const result = await templateEngine.executeFriggCommand(
            command, 
            args || [], 
            workingDirectory || process.cwd()
        );

        res.json({
            success: true,
            output: result.stdout,
            error: result.stderr,
            exitCode: result.code
        });
    } catch (error) {
        console.error('CLI execution error:', error);
        res.status(500).json({
            error: 'CLI command failed',
            message: error.message
        });
    }
});

/**
 * Get available Frigg API modules from NPM
 */
router.get('/npm/modules', async (req, res) => {
    try {
        const { includePrerelease, forceRefresh } = req.query;
        
        const modules = await npmRegistry.searchApiModules({
            includePrerelease: includePrerelease === 'true',
            forceRefresh: forceRefresh === 'true'
        });

        res.json({
            success: true,
            count: modules.length,
            modules
        });
    } catch (error) {
        console.error('NPM modules fetch error:', error);
        res.status(500).json({
            error: 'Failed to fetch NPM modules',
            message: error.message
        });
    }
});

/**
 * Get modules grouped by type/category
 */
router.get('/npm/modules/grouped', async (req, res) => {
    try {
        const grouped = await npmRegistry.getModulesByType();
        
        res.json({
            success: true,
            groups: Object.keys(grouped),
            modules: grouped
        });
    } catch (error) {
        console.error('NPM modules grouping error:', error);
        res.status(500).json({
            error: 'Failed to group NPM modules',
            message: error.message
        });
    }
});

/**
 * Get detailed information about a specific package
 */
router.get('/npm/modules/:packageName', async (req, res) => {
    try {
        const { packageName } = req.params;
        const { version } = req.query;
        
        // Validate package name format
        if (!packageName.startsWith('@friggframework/api-module-')) {
            return res.status(400).json({
                error: 'Invalid package name',
                message: 'Package name must start with @friggframework/api-module-'
            });
        }

        const details = await npmRegistry.getPackageDetails(packageName, version || 'latest');
        
        res.json({
            success: true,
            package: details
        });
    } catch (error) {
        console.error('Package details error:', error);
        res.status(500).json({
            error: 'Failed to fetch package details',
            message: error.message
        });
    }
});

/**
 * Get all versions for a specific package
 */
router.get('/npm/modules/:packageName/versions', async (req, res) => {
    try {
        const { packageName } = req.params;
        
        const versions = await npmRegistry.getPackageVersions(packageName);
        
        res.json({
            success: true,
            count: versions.length,
            versions
        });
    } catch (error) {
        console.error('Package versions error:', error);
        res.status(500).json({
            error: 'Failed to fetch package versions',
            message: error.message
        });
    }
});

/**
 * Check compatibility between package and Frigg core
 */
router.post('/npm/compatibility', async (req, res) => {
    try {
        const { packageName, packageVersion, friggVersion } = req.body;
        
        if (!packageName || !packageVersion || !friggVersion) {
            return res.status(400).json({
                error: 'Missing required parameters',
                required: ['packageName', 'packageVersion', 'friggVersion']
            });
        }

        const compatibility = await npmRegistry.checkCompatibility(
            packageName,
            packageVersion,
            friggVersion
        );
        
        res.json({
            success: true,
            compatibility
        });
    } catch (error) {
        console.error('Compatibility check error:', error);
        res.status(500).json({
            error: 'Failed to check compatibility',
            message: error.message
        });
    }
});

/**
 * Get NPM cache statistics
 */
router.get('/npm/cache/stats', async (req, res) => {
    try {
        const stats = npmRegistry.getCacheStats();
        
        res.json({
            success: true,
            cache: stats
        });
    } catch (error) {
        console.error('Cache stats error:', error);
        res.status(500).json({
            error: 'Failed to get cache statistics',
            message: error.message
        });
    }
});

/**
 * Clear NPM cache
 */
router.delete('/npm/cache', async (req, res) => {
    try {
        const { pattern } = req.query;
        
        npmRegistry.clearCache(pattern);
        
        res.json({
            success: true,
            message: pattern ? `Cache cleared for pattern: ${pattern}` : 'All cache cleared'
        });
    } catch (error) {
        console.error('Cache clear error:', error);
        res.status(500).json({
            error: 'Failed to clear cache',
            message: error.message
        });
    }
});

// Implementation functions

async function generateIntegration(config, req) {
    try {
        // Validate integration configuration
        const errors = validateIntegrationConfig(config);
        if (errors.length > 0) {
            throw new Error(`Configuration errors: ${errors.join(', ')}`);
        }

        // Generate integration using template engine
        const result = templateEngine.generateIntegration(config);
        
        // Determine output directory
        const outputDir = getOutputDirectory(req, 'integrations', config.name);
        
        // Write files if requested
        if (req.body.writeFiles !== false) {
            const writtenFiles = await templateEngine.writeFiles(result.files, outputDir);
            result.writtenFiles = writtenFiles;
        }

        return {
            success: true,
            type: 'integration',
            files: result.files.map(f => f.name),
            outputDirectory: outputDir,
            metadata: result.metadata
        };
    } catch (error) {
        throw new Error(`Integration generation failed: ${error.message}`);
    }
}

async function generateAPIEndpoints(config, req) {
    try {
        // Validate API configuration
        const errors = validateAPIConfig(config);
        if (errors.length > 0) {
            throw new Error(`Configuration errors: ${errors.join(', ')}`);
        }

        // Generate API endpoints using template engine
        const result = templateEngine.generateAPIEndpoints(config);
        
        // Determine output directory
        const outputDir = getOutputDirectory(req, 'api', config.name);
        
        // Write files if requested
        if (req.body.writeFiles !== false) {
            const writtenFiles = await templateEngine.writeFiles(result.files, outputDir);
            result.writtenFiles = writtenFiles;
        }

        return {
            success: true,
            type: 'api-endpoints',
            files: result.files.map(f => f.name),
            outputDirectory: outputDir,
            metadata: result.metadata
        };
    } catch (error) {
        throw new Error(`API generation failed: ${error.message}`);
    }
}

async function generateProjectScaffold(config, req) {
    try {
        // Validate project configuration
        const errors = validateProjectConfig(config);
        if (errors.length > 0) {
            throw new Error(`Configuration errors: ${errors.join(', ')}`);
        }

        // Generate project scaffold using template engine
        const result = templateEngine.generateProjectScaffold(config);
        
        // Determine output directory
        const outputDir = getOutputDirectory(req, 'projects', config.name);
        
        // Write files if requested
        if (req.body.writeFiles !== false) {
            const writtenFiles = await templateEngine.writeFiles(result.files, outputDir);
            result.writtenFiles = writtenFiles;
            
            // Initialize git repository if requested
            if (config.features?.git) {
                try {
                    await templateEngine.executeFriggCommand('init', ['--git'], outputDir);
                } catch (gitError) {
                    console.warn('Git initialization failed:', gitError.message);
                }
            }
        }

        return {
            success: true,
            type: 'project-scaffold',
            files: result.files.map(f => f.name),
            outputDirectory: outputDir,
            metadata: result.metadata
        };
    } catch (error) {
        throw new Error(`Project scaffold generation failed: ${error.message}`);
    }
}

async function generateCustomCode(code, metadata, req) {
    try {
        if (!code) {
            throw new Error('Code content is required for custom generation');
        }

        // Create file structure from code and metadata
        let files;
        if (metadata?.files) {
            files = metadata.files;
        } else if (typeof code === 'string') {
            files = [{ name: 'index.js', content: code }];
        } else if (typeof code === 'object') {
            files = Object.entries(code).map(([name, content]) => ({
                name,
                content: typeof content === 'string' ? content : JSON.stringify(content, null, 2)
            }));
        } else {
            throw new Error('Invalid code format');
        }

        // Determine output directory
        const outputDir = getOutputDirectory(req, 'custom', metadata?.name || 'generated');
        
        // Write files if requested
        if (req.body.writeFiles !== false) {
            const writtenFiles = await templateEngine.writeFiles(files, outputDir);
            return {
                success: true,
                type: 'custom',
                files: files.map(f => f.name),
                writtenFiles,
                outputDirectory: outputDir,
                metadata
            };
        }

        return {
            success: true,
            type: 'custom',
            files: files.map(f => f.name),
            outputDirectory: outputDir,
            metadata
        };
    } catch (error) {
        throw new Error(`Custom code generation failed: ${error.message}`);
    }
}

function getOutputDirectory(req, type, name) {
    const baseDir = req.body.outputDirectory || path.join(process.cwd(), 'generated');
    return path.join(baseDir, type, name);
}

function validateConfiguration(type, config) {
    switch (type) {
        case 'integration':
            return validateIntegrationConfig(config);
        case 'api-endpoint':
            return validateAPIConfig(config);
        case 'project-scaffold':
            return validateProjectConfig(config);
        default:
            return [];
    }
}

function validateIntegrationConfig(config) {
    const errors = [];
    
    if (!config?.name) {
        errors.push('Integration name is required');
    } else if (!/^[a-z0-9-]+$/.test(config.name)) {
        errors.push('Integration name must contain only lowercase letters, numbers, and hyphens');
    }
    
    if (!config?.baseURL) {
        errors.push('Base URL is required');
    } else {
        try {
            new URL(config.baseURL);
        } catch {
            errors.push('Base URL must be a valid URL');
        }
    }
    
    if (!config?.type) {
        errors.push('Authentication type is required');
    } else if (!['api', 'oauth2', 'basic-auth', 'oauth1', 'custom'].includes(config.type)) {
        errors.push('Invalid authentication type');
    }
    
    if (config.type === 'oauth2') {
        if (!config.authorizationURL) {
            errors.push('Authorization URL is required for OAuth2');
        }
        if (!config.tokenURL) {
            errors.push('Token URL is required for OAuth2');
        }
    }
    
    return errors;
}

function validateAPIConfig(config) {
    const errors = [];
    
    if (!config?.name) {
        errors.push('API name is required');
    }
    
    if (!config?.endpoints || !Array.isArray(config.endpoints)) {
        errors.push('At least one endpoint is required');
    } else {
        config.endpoints.forEach((endpoint, index) => {
            if (!endpoint.path) {
                errors.push(`Endpoint ${index + 1}: Path is required`);
            }
            if (!endpoint.method) {
                errors.push(`Endpoint ${index + 1}: HTTP method is required`);
            }
        });
    }
    
    return errors;
}

function validateProjectConfig(config) {
    const errors = [];
    
    if (!config?.name) {
        errors.push('Project name is required');
    } else if (!/^[a-zA-Z0-9-_]+$/.test(config.name)) {
        errors.push('Project name must contain only letters, numbers, hyphens, and underscores');
    }
    
    if (!config?.template) {
        errors.push('Project template is required');
    }
    
    if (!config?.database) {
        errors.push('Database selection is required');
    }
    
    return errors;
}

async function getAvailableTemplates() {
    // Return available templates with metadata
    return {
        integration: {
            types: ['api', 'oauth2', 'basic-auth', 'oauth1', 'custom'],
            schemas: ['entity', 'api', 'integration']
        },
        api: {
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
            authentication: ['bearer', 'api-key', 'basic', 'none']
        },
        project: {
            templates: ['basic-backend', 'microservices', 'serverless', 'full-stack'],
            databases: ['mongodb', 'postgresql', 'mysql', 'dynamodb', 'redis'],
            features: ['authentication', 'logging', 'monitoring', 'testing', 'docker', 'ci']
        }
    };
}

async function getCLIStatus() {
    try {
        const cliPath = path.join(__dirname, '../../../frigg-cli/index.js');
        const exists = await fs.pathExists(cliPath);
        
        if (!exists) {
            return {
                available: false,
                error: 'Frigg CLI not found'
            };
        }

        // Test CLI execution
        const result = await templateEngine.executeFriggCommand('--version');
        
        return {
            available: true,
            version: result.stdout.trim(),
            path: cliPath
        };
    } catch (error) {
        return {
            available: false,
            error: error.message
        };
    }
}

export default router;