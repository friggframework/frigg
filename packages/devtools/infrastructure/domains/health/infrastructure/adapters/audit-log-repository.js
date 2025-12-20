const fs = require('fs');
const path = require('path');
const os = require('os');

class AuditLogRepository {
    constructor({ logDirectory } = {}) {
        this.logDirectory =
            logDirectory || path.join(os.homedir(), '.frigg', 'audit-logs');

        if (!fs.existsSync(this.logDirectory)) {
            fs.mkdirSync(this.logDirectory, { recursive: true });
        }
    }

    async logCleanupOperation(operation) {
        try {
            const logEntry = {
                timestamp: operation.timestamp,
                stackIdentifier: operation.stackIdentifier,
                dryRun: operation.dryRun || false,
                deletionPlan: operation.deletionPlan,
                result: operation.result,
            };

            const logLine = JSON.stringify(logEntry) + '\n';
            const logPath = this._getCleanupLogPath();

            fs.appendFileSync(logPath, logLine, 'utf8');

            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error.message,
            };
        }
    }

    async logDeletionAttempt(attempt) {
        try {
            const logEntry = {
                timestamp: attempt.timestamp,
                physicalId: attempt.physicalId,
                resourceType: attempt.resourceType,
                logicalId: attempt.logicalId,
                success: attempt.success,
                error: attempt.error,
                errorMessage: attempt.errorMessage,
            };

            const logLine = JSON.stringify(logEntry) + '\n';
            const logPath = this._getDeletionLogPath();

            fs.appendFileSync(logPath, logLine, 'utf8');

            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: error.message,
            };
        }
    }

    async getRecentOperations(limit = 100) {
        try {
            const logPath = this._getCleanupLogPath();

            if (!fs.existsSync(logPath)) {
                return [];
            }

            const content = fs.readFileSync(logPath, 'utf8');
            const lines = content.trim().split('\n').filter(Boolean);

            const operations = [];
            for (const line of lines) {
                try {
                    operations.push(JSON.parse(line));
                } catch (error) {
                    continue;
                }
            }

            return operations.reverse().slice(0, limit);
        } catch (error) {
            return [];
        }
    }

    _getCleanupLogPath() {
        return path.join(this.logDirectory, 'cleanup-operations.log');
    }

    _getDeletionLogPath() {
        return path.join(this.logDirectory, 'deletion-attempts.log');
    }
}

module.exports = AuditLogRepository;
