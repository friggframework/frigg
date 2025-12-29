/**
 * Encryption Logger
 *
 * Centralized logging for encryption operations.
 * Prevents sensitive data leakage in production logs.
 */

const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
};

class EncryptionLogger {
    constructor() {
        this.minLevel = this._getMinLevel();
    }

    _getMinLevel() {
        const level = process.env.FRIGG_LOG_LEVEL || 'INFO';
        return LOG_LEVELS[level.toUpperCase()] ?? LOG_LEVELS.INFO;
    }

    _shouldLog(level) {
        return LOG_LEVELS[level] >= this.minLevel;
    }

    _sanitize(message) {
        // Remove potential key material or encrypted data from logs
        if (typeof message === 'string') {
            // Truncate long base64 strings that might be keys or encrypted data
            return message.replace(
                /([A-Za-z0-9+/=]{50,})/g,
                (match) => `${match.substring(0, 10)}...[${match.length} chars]`
            );
        }
        return message;
    }

    debug(message, ...args) {
        if (this._shouldLog('DEBUG')) {
            console.log(`[Frigg Debug]`, this._sanitize(message), ...args);
        }
    }

    info(message, ...args) {
        if (this._shouldLog('INFO')) {
            console.log(`[Frigg]`, this._sanitize(message), ...args);
        }
    }

    warn(message, ...args) {
        if (this._shouldLog('WARN')) {
            console.warn(`[Frigg]`, this._sanitize(message), ...args);
        }
    }

    error(message, error) {
        if (this._shouldLog('ERROR')) {
            const sanitizedMessage = this._sanitize(message);

            // In production, don't log stack traces with sensitive paths
            const isProduction = process.env.STAGE === 'production';

            if (error && !isProduction) {
                console.error(`[Frigg]`, sanitizedMessage, error);
            } else if (error) {
                console.error(`[Frigg]`, sanitizedMessage, error.message);
            } else {
                console.error(`[Frigg]`, sanitizedMessage);
            }
        }
    }
}

// Singleton instance
const logger = new EncryptionLogger();

module.exports = { logger };
