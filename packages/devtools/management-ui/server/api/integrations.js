import express from 'express'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs-extra'
import { createStandardResponse, createErrorResponse, ERROR_CODES, asyncHandler } from '../utils/response.js'

const router = express.Router();
const execAsync = promisify(exec);

// Helper to get available integrations
async function getAvailableIntegrations() {
    try {
        // This would typically query npm or a registry
        // For now, return a mock list
        return [
            {
                name: '@friggframework/api-module-slack',
                version: 'latest',
                description: 'Slack integration for Frigg',
                installed: false
            },
            {
                name: '@friggframework/api-module-salesforce',
                version: 'latest',
                description: 'Salesforce integration for Frigg',
                installed: false
            },
            {
                name: '@friggframework/api-module-hubspot',
                version: 'latest',
                description: 'HubSpot integration for Frigg',
                installed: false
            },
            {
                name: '@friggframework/api-module-google',
                version: 'latest',
                description: 'Google integration for Frigg',
                installed: false
            }
        ];
    } catch (error) {
        console.error('Error fetching integrations:', error);
        return [];
    }
}

// Helper to get installed integrations
async function getInstalledIntegrations() {
    try {
        const backendPath = path.join(process.cwd(), '../../../backend');
        const packageJsonPath = path.join(backendPath, 'package.json');
        
        if (await fs.pathExists(packageJsonPath)) {
            const packageJson = await fs.readJson(packageJsonPath);
            const dependencies = packageJson.dependencies || {};
            
            return Object.keys(dependencies)
                .filter(dep => dep.includes('@friggframework/api-module-'))
                .map(dep => ({
                    name: dep,
                    version: dependencies[dep],
                    installed: true
                }));
        }
        
        return [];
    } catch (error) {
        console.error('Error reading installed integrations:', error);
        return [];
    }
}

// List all integrations
router.get('/', async (req, res) => {
    try {
        const [available, installed] = await Promise.all([
            getAvailableIntegrations(),
            getInstalledIntegrations()
        ]);

        // Merge lists
        const installedNames = installed.map(i => i.name);
        const allIntegrations = [
            ...installed,
            ...available.filter(a => !installedNames.includes(a.name))
        ];

        res.json({
            integrations: allIntegrations,
            total: allIntegrations.length
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

export default router