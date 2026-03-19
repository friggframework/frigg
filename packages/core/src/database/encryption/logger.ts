/**
 * Encryption Logger
 *
 * Centralized logging for encryption operations.
 * Prevents sensitive data leakage in production logs.
 */

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const LOG_LEVELS: Record<LogLevel, number> = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
};

export class EncryptionLogger {
    private minLevel: number;

    constructor() {
        this.minLevel = this._getMinLevel();
    }

    private _getMinLevel(): number {
        const level = (process.env.FRIGG_LOG_LEVEL || 'INFO').toUpperCase() as LogLevel;
        return LOG_LEVELS[level] ?? LOG_LEVELS.INFO;
    }

    private _shouldLog(level: LogLevel): boolean {
        return LOG_LEVELS[level] >= this.minLevel;
    }

    private _sanitize(message: string): string {
        if (typeof message === 'string') {
            return message.replace(/([A-Za-z0-9+/=]{50,})/g, (match) =>
                `${match.substring(0, 10)}...[${match.length} chars]`
            );
        }
        return message;
    }

    debug(message: string, ...args: unknown[]): void {
        if (this._shouldLog('DEBUG')) {
            console.log(`[Frigg Debug]`, this._sanitize(message), ...args);
        }
    }

    info(message: string, ...args: unknown[]): void {
        if (this._shouldLog('INFO')) {
            console.log(`[Frigg]`, this._sanitize(message), ...args);
        }
    }

    warn(message: string, ...args: unknown[]): void {
        if (this._shouldLog('WARN')) {
            console.warn(`[Frigg]`, this._sanitize(message), ...args);
        }
    }

    error(message: string, error?: Error | unknown): void {
        if (this._shouldLog('ERROR')) {
            const sanitizedMessage = this._sanitize(message);
            const isProduction = process.env.STAGE === 'production';

            if (error && !isProduction) {
                console.error(`[Frigg]`, sanitizedMessage, error);
            } else if (error) {
                console.error(`[Frigg]`, sanitizedMessage, (error as Error).message);
            } else {
                console.error(`[Frigg]`, sanitizedMessage);
            }
        }
    }
}

// Singleton instance
export const logger = new EncryptionLogger();

