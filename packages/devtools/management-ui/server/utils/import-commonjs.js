import { createRequire } from 'module';
import { pathToFileURL } from 'url';

/**
 * Helper function to import CommonJS modules in an ES module environment
 * @param {string} modulePath - The path to the CommonJS module
 * @returns {Promise<any>} The imported module
 */
export async function importCommonJS(modulePath) {
    try {
        // First try dynamic import (works if the module supports ESM)
        const moduleURL = pathToFileURL(modulePath).href;
        return await import(moduleURL);
    } catch (error) {
        // If dynamic import fails, try using createRequire
        try {
            const require = createRequire(import.meta.url);
            const module = require(modulePath);
            // Wrap in an object to match ESM import structure
            return { default: module, ...module };
        } catch (requireError) {
            console.error('Failed to import module:', modulePath);
            console.error('Dynamic import error:', error.message);
            console.error('Require error:', requireError.message);
            throw new Error(`Unable to import module at ${modulePath}`);
        }
    }
}