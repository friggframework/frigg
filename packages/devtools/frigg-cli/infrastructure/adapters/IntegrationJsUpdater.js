const path = require('path');

/**
 * IntegrationJsUpdater
 *
 * Infrastructure adapter for updating Integration.js class files
 * Adds API module imports and updates the static Definition.modules object
 */
class IntegrationJsUpdater {
    constructor(fileSystemAdapter, backendPath = process.cwd()) {
        this.fileSystemAdapter = fileSystemAdapter;
        this.backendPath = backendPath;
    }

    /**
     * Add an API module to an Integration.js file
     *
     * Updates:
     * 1. Adds require() import at top of file
     * 2. Adds module to static Definition.modules object
     *
     * @param {string} integrationName - Integration name (kebab-case)
     * @param {string} moduleName - API module name (kebab-case)
     * @param {string} source - Module source ('local', 'npm', 'git')
     */
    async addModuleToIntegration(integrationName, moduleName, source = 'local') {
        return this.addModulesToIntegration(integrationName, [{name: moduleName, source}]);
    }

    /**
     * Add multiple API modules to an Integration.js file (batch operation)
     *
     * @param {string} integrationName - Integration name (kebab-case)
     * @param {Array<{name: string, source: string}>} modules - Array of modules to add
     */
    async addModulesToIntegration(integrationName, modules = []) {
        const className = this._toClassName(integrationName);
        const integrationJsPath = path.join(
            this.backendPath,
            'src/integrations',
            `${className}Integration.js`
        );

        // Check if file exists
        const exists = await this.fileSystemAdapter.exists(integrationJsPath);
        if (!exists) {
            throw new Error(`Integration.js not found at ${integrationJsPath}`);
        }

        // Write updated content using updateFile's callback pattern
        await this.fileSystemAdapter.updateFile(integrationJsPath, (currentContent) => {
            let content = currentContent;

            // Add all imports
            for (const module of modules) {
                content = this._addModuleImport(content, module.name, module.source || 'local');
            }

            // Add all modules to Definition
            for (const module of modules) {
                content = this._addModuleToDefinition(content, module.name);
            }

            return content;
        });
    }

    /**
     * Add require() import for API module at top of file
     */
    _addModuleImport(content, moduleName, source = 'local') {
        const camelName = this._toCamelCase(moduleName);
        let importStatement;

        // Different import path based on source
        if (source === 'npm') {
            importStatement = `const ${camelName} = require('@friggframework/api-module-${moduleName}');`;
        } else {
            // local or git - use relative path
            importStatement = `const ${camelName} = require('../api-modules/${moduleName}');`;
        }

        // Check if import already exists
        if (content.includes(importStatement)) {
            return content;
        }

        // Find the position to insert (after other requires, before class definition)
        const lines = content.split('\n');
        let insertIndex = 0;

        // Find last require statement
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('require(')) {
                insertIndex = i + 1;
            }
            // Stop at class definition
            if (lines[i].includes('class ') && lines[i].includes('Integration')) {
                break;
            }
        }

        // Insert import
        lines.splice(insertIndex, 0, importStatement);

        return lines.join('\n');
    }

    /**
     * Add module to static Definition.modules object
     */
    _addModuleToDefinition(content, moduleName) {
        const camelName = this._toCamelCase(moduleName);
        const moduleEntry = `            ${camelName}: {\n                definition: ${camelName}.Definition,\n            },`;

        // Check if module already exists in Definition
        const modulePattern = new RegExp(`${camelName}:\\s*{[\\s\\S]*?definition:`);
        if (modulePattern.test(content)) {
            return content;
        }

        // Find the modules object in static Definition
        const modulesPattern = /modules:\s*{/;
        const match = content.match(modulesPattern);

        if (!match) {
            // No modules object exists yet, need to add it
            return this._addModulesObjectToDefinition(content, moduleName);
        }

        // Parse line by line to find the right insertion point
        const lines = content.split('\n');
        let insertIndex = -1;
        let modulesLineIndex = -1;
        let braceCount = 0;
        let inModules = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.includes('modules: {')) {
                modulesLineIndex = i;
                inModules = true;
                braceCount = 1;
                // Always insert right after modules: { line
                insertIndex = i + 1;
                break;
            }
        }

        // Insert the module entry
        lines.splice(insertIndex, 0, moduleEntry);

        return lines.join('\n');
    }

    /**
     * Add modules object to Definition if it doesn't exist
     */
    _addModulesObjectToDefinition(content, moduleName) {
        const camelName = this._toCamelCase(moduleName);
        const modulesBlock = `        modules: {\n            ${camelName}: {\n                definition: ${camelName}.Definition,\n            },\n        },`;

        // Find static Definition
        const definitionPattern = /static\s+Definition\s*=\s*{/;
        const match = content.match(definitionPattern);

        if (!match) {
            throw new Error('Could not find static Definition in Integration.js');
        }

        // Find good insertion point (after display object)
        const displayEndPattern = /},\s*$/m;
        let lines = content.split('\n');
        let insertIndex = -1;

        let inDefinition = false;
        let braceCount = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.includes('static Definition')) {
                inDefinition = true;
                braceCount = 1;
                continue;
            }

            if (inDefinition) {
                // Count braces
                braceCount += (line.match(/{/g) || []).length;
                braceCount -= (line.match(/}/g) || []).length;

                // Look for display block end
                if (line.includes('display:')) {
                    // Find the closing of display object
                    for (let j = i + 1; j < lines.length; j++) {
                        if (lines[j].trim().startsWith('},')) {
                            insertIndex = j + 1;
                            break;
                        }
                    }
                    if (insertIndex !== -1) break;
                }
            }
        }

        if (insertIndex === -1) {
            throw new Error('Could not find insertion point for modules in static Definition');
        }

        // Insert modules block
        lines.splice(insertIndex, 0, modulesBlock);

        return lines.join('\n');
    }

    /**
     * Convert kebab-case to camelCase
     */
    _toCamelCase(str) {
        return str.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
    }

    /**
     * Convert kebab-case to ClassName
     */
    _toClassName(str) {
        return str
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join('');
    }

    /**
     * Check if Integration.js file exists
     */
    async exists(integrationName) {
        const className = this._toClassName(integrationName);
        const integrationJsPath = path.join(
            this.backendPath,
            'src/integrations',
            `${className}Integration.js`
        );
        return await this.fileSystemAdapter.exists(integrationJsPath);
    }
}

module.exports = {IntegrationJsUpdater};
