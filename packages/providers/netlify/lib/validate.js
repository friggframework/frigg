/**
 * Netlify App Definition Validator
 *
 * Validates a complete Frigg app definition for Netlify deployment.
 * Covers database, encryption, queue, websocket, and VPC configuration.
 */
const { validateNetlifyDbConfig } = require('./netlify-db');

/**
 * Validate an app definition for Netlify deployment.
 *
 * @param {Object} appDefinition - Frigg app definition
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateNetlifyConfig(appDefinition) {
    const errors = [];
    const warnings = [];

    if (!appDefinition) {
        errors.push('App definition is required');
        return { valid: false, errors, warnings };
    }

    // Database validation (delegates to existing netlify-db.js)
    const dbValidation = validateNetlifyDbConfig(appDefinition);
    errors.push(...dbValidation.errors);
    warnings.push(...dbValidation.warnings);

    // Encryption validation
    const encryption = appDefinition.encryption;
    if (encryption?.useDefaultKMSForFieldLevelEncryption) {
        warnings.push(
            'useDefaultKMSForFieldLevelEncryption is AWS-specific. ' +
                'On Netlify, set fieldLevelEncryptionMethod: "aes" and configure AES_KEY_ID + AES_KEY.'
        );
    }

    // WebSocket validation
    if (appDefinition.websockets?.enable) {
        errors.push(
            'Netlify does not support persistent WebSocket connections. ' +
                'Remove websockets.enable or use a provider that supports WebSockets (e.g., AWS).'
        );
    }

    // VPC validation
    if (appDefinition.vpc?.enable) {
        warnings.push(
            'VPC configuration is ignored on Netlify. ' +
                'Ensure your database accepts connections from Netlify IP ranges.'
        );
    }

    // SSM validation
    if (appDefinition.ssm?.enable) {
        warnings.push(
            'AWS SSM (Systems Manager) is not available on Netlify. ' +
                'Use Netlify environment variables instead.'
        );
    }

    // Queue validation
    const queueProvider = appDefinition.queue?.provider;
    if (queueProvider === 'sqs') {
        errors.push(
            'SQS queue provider is AWS-specific. ' +
                'On Netlify, use queue.provider: "netlify-background" or "qstash".'
        );
    }

    // Integrations validation
    if (!appDefinition.integrations || appDefinition.integrations.length === 0) {
        warnings.push(
            'No integrations configured. Add at least one integration to your app definition.'
        );
    }

    const valid = errors.length === 0;
    return { valid, errors, warnings };
}

module.exports = { validateNetlifyConfig };
