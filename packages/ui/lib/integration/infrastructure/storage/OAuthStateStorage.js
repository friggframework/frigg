/**
 * @file OAuth State Storage
 * @description Manages OAuth state persistence across redirects
 * Uses sessionStorage to preserve context during OAuth flow
 */

export class OAuthStateStorage {
    constructor(storageKey = 'frigg_oauth_states') {
        this.storageKey = storageKey;
        this.storage = typeof window !== 'undefined' ? window.sessionStorage : null;
    }

    /**
     * Save OAuth state with context
     * @param {string} state - OAuth state parameter
     * @param {object} context - Context to preserve (entityType, integrationType, etc.)
     */
    async saveState(state, context) {
        if (!this.storage) {
            throw new Error('SessionStorage not available');
        }

        const states = this.getAllStates();
        states[state] = {
            ...context,
            timestamp: Date.now(),
            expiresAt: Date.now() + (30 * 60 * 1000) // 30 minutes
        };

        this.storage.setItem(this.storageKey, JSON.stringify(states));
    }

    /**
     * Retrieve OAuth state context
     * @param {string} state - OAuth state parameter
     * @returns {object|null} Context object or null if not found/expired
     */
    async getState(state) {
        if (!this.storage) {
            return null;
        }

        const states = this.getAllStates();
        const stateData = states[state];

        if (!stateData) {
            return null;
        }

        // Check expiration
        if (Date.now() > stateData.expiresAt) {
            await this.removeState(state);
            return null;
        }

        return stateData;
    }

    /**
     * Remove OAuth state after completion
     * @param {string} state - OAuth state parameter
     */
    async removeState(state) {
        if (!this.storage) {
            return;
        }

        const states = this.getAllStates();
        delete states[state];
        this.storage.setItem(this.storageKey, JSON.stringify(states));
    }

    /**
     * Get all stored states
     * @returns {object} Map of state to context
     */
    getAllStates() {
        if (!this.storage) {
            return {};
        }

        try {
            const stored = this.storage.getItem(this.storageKey);
            return stored ? JSON.parse(stored) : {};
        } catch (error) {
            console.error('Error parsing OAuth states:', error);
            return {};
        }
    }

    /**
     * Clean up expired states
     */
    async cleanupExpiredStates() {
        if (!this.storage) {
            return;
        }

        const states = this.getAllStates();
        const now = Date.now();
        let modified = false;

        for (const [state, data] of Object.entries(states)) {
            if (now > data.expiresAt) {
                delete states[state];
                modified = true;
            }
        }

        if (modified) {
            this.storage.setItem(this.storageKey, JSON.stringify(states));
        }
    }

    /**
     * Clear all OAuth states (useful for logout)
     */
    async clearAll() {
        if (!this.storage) {
            return;
        }

        this.storage.removeItem(this.storageKey);
    }

    /**
     * Save integration installation context
     * Used to preserve which integration user was installing before OAuth redirect
     */
    async saveInstallationContext(integrationType, context = {}) {
        const contextKey = `${this.storageKey}_install_context`;
        if (!this.storage) {
            return;
        }

        this.storage.setItem(contextKey, JSON.stringify({
            integrationType,
            ...context,
            timestamp: Date.now()
        }));
    }

    /**
     * Retrieve and clear installation context
     */
    async getInstallationContext() {
        const contextKey = `${this.storageKey}_install_context`;
        if (!this.storage) {
            return null;
        }

        try {
            const stored = this.storage.getItem(contextKey);
            if (!stored) return null;

            const context = JSON.parse(stored);
            this.storage.removeItem(contextKey);
            return context;
        } catch (error) {
            console.error('Error parsing installation context:', error);
            return null;
        }
    }
}
