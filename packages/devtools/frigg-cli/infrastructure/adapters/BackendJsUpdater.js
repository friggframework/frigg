const path = require('path');
const fs = require('fs-extra');

/**
 * BackendJsUpdater
 *
 * Infrastructure service for updating backend.js file with new integrations
 * Uses AST manipulation to safely add integration imports and registrations
 */
class BackendJsUpdater {
    constructor(fileSystemAdapter, backendPath) {
        this.fileSystemAdapter = fileSystemAdapter;
        this.backendPath = backendPath;
        this.indexJsPath = path.join(backendPath, 'index.js');
    }

    /**
     * Register an integration in backend/index.js
     * @param {string} integrationName - kebab-case integration name
     * @returns {Promise<void>}
     */
    async registerIntegration(integrationName) {
        if (!await this.fileSystemAdapter.exists(this.indexJsPath)) {
            throw new Error('backend/index.js not found');
        }

        const className = this._toClassName(integrationName);
        const importPath = `./src/integrations/${className}Integration`;

        await this.fileSystemAdapter.updateFile(this.indexJsPath, (content) => {
            return this._addIntegration(content, className, integrationName, importPath);
        });
    }

    /**
     * Remove an integration from backend/index.js
     * @param {string} integrationName
     * @returns {Promise<void>}
     */
    async unregisterIntegration(integrationName) {
        if (!await this.fileSystemAdapter.exists(this.indexJsPath)) {
            throw new Error('backend/index.js not found');
        }

        const className = this._toClassName(integrationName);

        await this.fileSystemAdapter.updateFile(this.indexJsPath, (content) => {
            return this._removeIntegration(content, className, integrationName);
        });
    }

    /**
     * Add integration to backend.js content
     * Simple string manipulation approach (can be replaced with AST parsing if needed)
     *
     * @param {string} content - Current backend.js content
     * @param {string} className - Integration class name
     * @param {string} integrationName - kebab-case name
     * @param {string} importPath - relative import path
     * @returns {string} - Updated content
     */
    _addIntegration(content, className, integrationName, importPath) {
        // Check if integration is already registered
        if (content.includes(`const ${className}Integration`)) {
            console.warn(`Integration ${integrationName} is already registered in backend.js`);
            return content;
        }

        let updated = content;

        // 1. Add import statement after other integration imports
        const importRegex = /(const \w+Integration = require\('\.\/src\/integrations\/[^']+'\);)/g;
        const importMatches = [...content.matchAll(importRegex)];

        if (importMatches.length > 0) {
            // Add after last integration import
            const lastImport = importMatches[importMatches.length - 1];
            const insertIndex = lastImport.index + lastImport[0].length;
            const importStatement = `\nconst ${className}Integration = require('${importPath}');`;
            updated = updated.slice(0, insertIndex) + importStatement + updated.slice(insertIndex);
        } else {
            // No existing imports - add at the top after requires
            const requiresRegex = /const .+ = require\([^)]+\);/g;
            const requireMatches = [...content.matchAll(requiresRegex)];
            if (requireMatches.length > 0) {
                const lastRequire = requireMatches[requireMatches.length - 1];
                const insertIndex = lastRequire.index + lastRequire[0].length;
                const importStatement = `\n\n// Integrations\nconst ${className}Integration = require('${importPath}');`;
                updated = updated.slice(0, insertIndex) + importStatement + updated.slice(insertIndex);
            }
        }

        // 2. Add to integrations array
        // Look for patterns:
        // - const integrations = [...]
        // - integrations: [...] (inside appDefinition object)

        // Try standalone array first
        const standaloneArrayRegex = /const integrations = \[([\s\S]*?)\];/;
        let match = updated.match(standaloneArrayRegex);

        if (match) {
            const currentArray = match[1];
            const newEntry = `\n    ${className}Integration,`;

            // Check if it's an empty array
            if (currentArray.trim() === '') {
                updated = updated.replace(standaloneArrayRegex, `const integrations = [${newEntry}\n];`);
            } else {
                // Add to existing array
                const insertAt = match.index + match[0].length - 2; // Before ];
                updated = updated.slice(0, insertAt) + ',' + newEntry + updated.slice(insertAt);
            }
        } else {
            // Try appDefinition pattern
            const appDefArrayRegex = /integrations:\s*\[([\s\S]*?)\]/;
            match = updated.match(appDefArrayRegex);

            if (match) {
                const currentArray = match[1];
                const newEntry = `\n        ${className}Integration,`;

                // Check if array is empty or has only comments
                const hasOnlyComments = currentArray.trim() === '' ||
                    currentArray.trim().split('\n').every(line => line.trim().startsWith('//'));

                if (hasOnlyComments) {
                    // Replace entire array content
                    updated = updated.replace(appDefArrayRegex, `integrations: [${newEntry}\n    ]`);
                } else {
                    // Add to existing array - find the last entry and add comma if needed
                    const lines = currentArray.split('\n');
                    const lastNonEmptyLine = lines.reverse().find(line => line.trim() && !line.trim().startsWith('//'));
                    const needsComma = lastNonEmptyLine && !lastNonEmptyLine.trim().endsWith(',');
                    const comma = needsComma ? ',' : '';

                    const insertAt = match.index + match[0].length - 1; // Before ]
                    updated = updated.slice(0, insertAt) + comma + newEntry + '\n    ' + updated.slice(insertAt);
                }
            } else {
                // No integrations array found - this is a problem
                console.warn('Could not find integrations array in backend/index.js');
            }
        }

        return updated;
    }

    /**
     * Remove integration from backend.js content
     *
     * @param {string} content
     * @param {string} className
     * @param {string} integrationName
     * @returns {string}
     */
    _removeIntegration(content, className, integrationName) {
        let updated = content;

        // 1. Remove import statement
        const importRegex = new RegExp(`\\nconst ${className}Integration = require\\([^)]+\\);`, 'g');
        updated = updated.replace(importRegex, '');

        // 2. Remove from integrations array
        const arrayEntryRegex = new RegExp(`,?\\s*${className}Integration,?`, 'g');
        updated = updated.replace(arrayEntryRegex, '');

        // Clean up extra commas
        updated = updated.replace(/,\s*,/g, ',');
        updated = updated.replace(/\[\s*,/g, '[');
        updated = updated.replace(/,\s*\]/g, ']');

        return updated;
    }

    /**
     * Convert kebab-case to ClassName
     * @param {string} kebabCase
     * @returns {string}
     */
    _toClassName(kebabCase) {
        return kebabCase
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join('');
    }

    /**
     * Check if backend/index.js exists
     * @returns {Promise<boolean>}
     */
    async exists() {
        return await this.fileSystemAdapter.exists(this.indexJsPath);
    }
}

module.exports = {BackendJsUpdater};
