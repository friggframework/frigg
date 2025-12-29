/**
 * Use case for retrieving all possible integration types that can be created.
 *
 * Supports optional visibility filtering via `Definition.visible` callback.
 * If an integration defines a `visible` function, it will be called with
 * the provided context to determine if the integration should be shown.
 *
 * @class GetPossibleIntegrations
 *
 * @example
 * // Integration with visibility control
 * class PremiumIntegration extends IntegrationBase {
 *     static Definition = {
 *         name: 'premium-feature',
 *         visible: (context) => context.user?.plan === 'premium',
 *         modules: { ... }
 *     };
 * }
 */
class GetPossibleIntegrations {
    /**
     * Creates a new GetPossibleIntegrations instance.
     * @param {Object} params - Configuration parameters.
     * @param {Array<import('../integration').Integration>} params.integrationClasses - Array of available integration classes.
     */
    constructor({ integrationClasses }) {
        this.integrationClasses = integrationClasses;
    }

    /**
     * Executes the retrieval of all possible integration types.
     * @async
     * @param {Object} [context] - Optional context for visibility filtering.
     *   The structure is determined by the host application.
     *   Common properties: { user: { id, plan, roles, ... } }
     * @returns {Promise<Object[]>} Array of integration option details for visible integration types.
     */
    async execute(context = null) {
        const visibleIntegrations = [];

        for (const integrationClass of this.integrationClasses) {
            const isVisible = await this._checkVisibility(
                integrationClass,
                context
            );
            if (isVisible) {
                visibleIntegrations.push(integrationClass.getOptionDetails());
            }
        }

        return visibleIntegrations;
    }

    /**
     * Checks if an integration is visible to the current context.
     * @private
     * @param {Function} integrationClass - The integration class to check.
     * @param {Object} context - The visibility context.
     * @returns {Promise<boolean>} True if visible, false otherwise.
     */
    async _checkVisibility(integrationClass, context) {
        const definition = integrationClass.Definition;

        // No visible function = always visible (default behavior)
        if (!definition?.visible) {
            return true;
        }

        // Call the visible function with context
        try {
            const result = definition.visible(context);
            // Support both sync and async visible functions
            return result instanceof Promise ? await result : result;
        } catch (error) {
            // If visibility check fails, default to hidden for safety
            console.error(
                `Visibility check failed for integration ${definition?.name}:`,
                error
            );
            return false;
        }
    }
}

module.exports = { GetPossibleIntegrations };
