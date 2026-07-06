/**
 * Script Factory
 *
 * Registry and factory for admin scripts.
 * Manages script registration, validation, and instantiation.
 *
 * Usage:
 * ```javascript
 * const factory = new ScriptFactory();
 * factory.register(MyScript);
 * const script = factory.createInstance('my-script', { executionId: '123' });
 * ```
 */
class ScriptFactory {
    constructor(scripts = []) {
        this.registry = new Map();

        // Register initial scripts
        scripts.forEach((ScriptClass) => this.register(ScriptClass));
    }

    /**
     * Register a script class
     * @param {Function} ScriptClass - Script class extending AdminScriptBase
     * @throws {Error} If script invalid or name collision
     */
    register(ScriptClass) {
        if (!ScriptClass || !ScriptClass.Definition) {
            throw new Error(
                'Script class must have a static Definition property'
            );
        }

        const definition = ScriptClass.Definition;
        const name = definition.name;

        if (!name) {
            throw new Error('Script Definition must have a name');
        }

        if (this.registry.has(name)) {
            throw new Error(`Script "${name}" is already registered`);
        }

        this.registry.set(name, ScriptClass);
    }

    /**
     * Register multiple scripts at once
     * @param {Array} scriptClasses - Array of script classes
     */
    registerAll(scriptClasses) {
        scriptClasses.forEach((ScriptClass) => this.register(ScriptClass));
    }

    /**
     * Check if script is registered
     * @param {string} name - Script name
     * @returns {boolean} True if registered
     */
    has(name) {
        return this.registry.has(name);
    }

    /**
     * Get script class by name
     * @param {string} name - Script name
     * @returns {Function} Script class
     * @throws {Error} If script not found
     */
    get(name) {
        const ScriptClass = this.registry.get(name);
        if (!ScriptClass) {
            throw new Error(`Script "${name}" not found`);
        }
        return ScriptClass;
    }

    /**
     * Get array of all registered script names
     * @returns {Array<string>} Array of script names
     */
    getNames() {
        return Array.from(this.registry.keys());
    }

    /**
     * Get all registered scripts
     * @returns {Array} Array of { name, definition, class }
     */
    getAll() {
        const scripts = [];
        for (const [name, ScriptClass] of this.registry.entries()) {
            scripts.push({
                name,
                definition: ScriptClass.Definition,
                class: ScriptClass,
            });
        }
        return scripts;
    }

    /**
     * Create script instance
     * @param {string} name - Script name
     * @param {Object} params - Constructor parameters
     * @returns {Object} Script instance
     * @throws {Error} If script not found
     */
    createInstance(name, params = {}) {
        const ScriptClass = this.get(name);
        return new ScriptClass(params);
    }

    /**
     * Remove script from registry
     * @param {string} name - Script name
     * @returns {boolean} True if removed
     */
    unregister(name) {
        return this.registry.delete(name);
    }

    /**
     * Clear all registered scripts
     */
    clear() {
        this.registry.clear();
    }

    /**
     * Get count of registered scripts
     * @returns {number} Count
     */
    get size() {
        return this.registry.size;
    }
}

// Singleton instance for global use
let globalFactory = null;

/**
 * Get global script factory instance
 * @returns {ScriptFactory} Global factory
 */
function getScriptFactory() {
    if (!globalFactory) {
        globalFactory = new ScriptFactory();
    }
    return globalFactory;
}

/**
 * Create a new script factory instance
 * @param {Array} scripts - Initial scripts to register
 * @returns {ScriptFactory} New factory
 */
function createScriptFactory(scripts = []) {
    return new ScriptFactory(scripts);
}

module.exports = { ScriptFactory, getScriptFactory, createScriptFactory };
