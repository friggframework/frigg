const { Options } = require('./options');

/**
 * Integration (Domain Aggregate-Root)
 * ----------------------------------
 * This class represents a *configured* integration instance at runtime. It is
 * deliberately split into **two layers**:
 *   1.  A *data snapshot* of the persisted record (id, userId, config, etc.).
 *   2.  A *behaviour* object: a concrete class supplied by the app developer
 *       that extends `IntegrationBase` and implements event handlers, user
 *       actions, custom routes, etc.
 *
 * The two layers are glued together via a **JavaScript `Proxy`**.  When a
 * property is requested on an `Integration` instance we:
 *   • Check if the property exists on the wrapper itself (data-layer).
 *   • Fallback to the behaviour instance (logic-layer).
 *   • If the value is a function we `.bind(this)` so that the function's
 *     `this` always points to the *wrapper* – giving it access to both data
 *     and behaviour transparently.
 *
 * This means you can treat a hydrated Integration as if it *were* the custom
 * class:
 *
 * ```js
 * const integration = await getIntegration.execute(id, userId);
 * // `send` actually lives on IntegrationBase but is accessible here
 * const actions = await integration.send('GET_USER_ACTIONS');
 * ```
 *
 * A corollary benefit is that **circular references stay internal**: the heavy
 * `Module → Api → delegate` graph is never exposed when we later serialise the
 * object to JSON – we map it to a DTO first.
 */

/**
 * Integration Domain Entity
 * Represents a configured integration with its data and behavior
 * Uses the strategy pattern to delegate behavior to the integration class
 * This is the main class that is used to interact with integrations
 */
class Integration {
    constructor({
        id,
        userId,
        entities,
        config,
        status,
        version,
        messages,
        integrationClass,
        modules = {}
    }) {
        // Data from record
        this.id = id;
        this.userId = userId;
        this.entities = entities;
        this.config = config;
        this.status = status;
        this.version = version;
        this.messages = messages;

        // Integration behavior (strategy pattern)
        this.integrationClass = integrationClass;

        // Loaded modules
        this.modules = modules;

        // Initialize basic behavior (sync parts only)
        this._initializeBasicBehavior();

        // --- Behaviour delegation via Proxy --------------------------------
        // The Proxy merges the *data layer* (this wrapper) with the *behaviour
        // layer* (custom IntegrationBase subclass).  Consumers don't have to
        // know (or care) where a method/property is defined.
        return new Proxy(this, {
            get(target, prop) {
                // First, check if property exists on Integration entity
                if (prop in target) {
                    return target[prop];
                }

                // Then, check if it exists on the behavior instance
                if (target.behavior && prop in target.behavior) {
                    const value = target.behavior[prop];

                    // If it's a function, bind the context to the Integration entity
                    if (typeof value === 'function') {
                        return value.bind(target);
                    }

                    return value;
                }

                // Return undefined for non-existent properties
                return undefined;
            }
        });
    }

    _initializeBasicBehavior() {
        // Initialize basic behavior (sync parts only)
        if (this.integrationClass) {
            // Create instance for behavior delegation
            this.behavior = new this.integrationClass({
                userId: this.userId,
                integrationId: this.id
            });

            // Copy events
            this.events = this.behavior.events || {};
            this.defaultEvents = this.behavior.defaultEvents || {};


            // Expose behaviour instance methods directly on the wrapper so that
            // early-bound handlers (created before behaviour existed) can still
            // access them without falling back through the Proxy. This prevents
            // `undefined` errors for methods like `loadDynamicUserActions` that
            // may be invoked inside default event-handlers.
            const proto = Object.getPrototypeOf(this.behavior);
            for (const key of Object.getOwnPropertyNames(proto)) {
                if (key === 'constructor') continue;
                if (typeof proto[key] === 'function' && this[key] === undefined) {
                    // Bind to behaviour so internal `this` remains correct.
                    this[key] = proto[key].bind(this.behavior);
                }
            }
        }
    }

    async initialize() {
        // Complete async initialization
        if (this.behavior) {
            // Load dynamic user actions
            try {
                const additionalUserActions = await this.loadDynamicUserActions();
                this.events = { ...this.events, ...additionalUserActions };
            } catch (e) {
                this.addError(e);
            }

            // Register event handlers
            await this.registerEventHandlers();
        }
    }

    // Core methods that should always be on Integration entity
    // These override any behavior methods with the same name

    // Module access helpers
    getModule(key) {
        return this.modules[key];
    }

    setModule(key, module) {
        this.modules[key] = module;
        // Also set on behavior for backward compatibility
        if (this.behavior) {
            this.behavior[key] = module;
        }
    }

    // State management
    addError(error) {
        if (!this.messages.errors) {
            this.messages.errors = [];
        }
        this.messages.errors.push(error);
        this.status = 'ERROR';
    }

    addWarning(warning) {
        if (!this.messages.warnings) {
            this.messages.warnings = [];
        }
        this.messages.warnings.push(warning);
    }

    // Domain methods
    isActive() {
        return this.status === 'ENABLED' || this.status === 'ACTIVE';
    }

    needsConfiguration() {
        return this.status === 'NEEDS_CONFIG';
    }

    hasErrors() {
        return this.status === 'ERROR';
    }

    belongsToUser(userId) {
        return this.userId.toString() === userId.toString();
    }

    // Get the underlying behavior instance (useful for debugging or special cases)
    getBehavior() {
        return this.behavior;
    }

    // Check if a method exists (either on entity or behavior)
    hasMethod(methodName) {
        return methodName in this || (this.behavior && methodName in this.behavior);
    }

    getOptionDetails() {
        const options = new Options({
            module: Object.values(this.integrationClass.Definition.modules)[0], // This is a placeholder until we revamp the frontend
            ...this.integrationClass.Definition,
        });
        return options.get();
    }

    /**
     * Custom JSON serializer to prevent circular references (e.g. Module → Api → delegate)
     * and to keep API responses lightweight.
     * Only primitive, serialisable data needed by clients is returned.
     */
    toJSON() {
        return {
            id: this.id,
            userId: this.userId,
            entities: this.entities,
            config: this.config,
            status: this.status,
            version: this.version,
            messages: this.messages,
            // Expose userActions if they were loaded/attached elsewhere
            userActions: this.userActions,
        };
    }
}

module.exports = { Integration }; 