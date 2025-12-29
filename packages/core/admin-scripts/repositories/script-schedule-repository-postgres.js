const { prisma } = require('../../database/prisma');
const {
    ScriptScheduleRepositoryInterface,
} = require('./script-schedule-repository-interface');

/**
 * PostgreSQL Script Schedule Repository Adapter
 * Handles script schedule persistence using Prisma with PostgreSQL
 *
 * PostgreSQL-specific characteristics:
 * - Uses Int IDs with autoincrement
 * - Requires ID conversion: String (app layer) ↔ Int (database)
 * - All returned IDs are converted to strings for application layer consistency
 * - scriptName has unique index
 */
class ScriptScheduleRepositoryPostgres extends ScriptScheduleRepositoryInterface {
    constructor() {
        super();
        this.prisma = prisma;
    }

    /**
     * Convert string ID to integer for PostgreSQL queries
     * @private
     * @param {string|number|null|undefined} id - ID to convert
     * @returns {number|null|undefined} Integer ID or null/undefined
     * @throws {Error} If ID cannot be converted to integer
     */
    _convertId(id) {
        if (id === null || id === undefined) return id;
        const parsed = Number.parseInt(id, 10);
        if (Number.isNaN(parsed)) {
            throw new Error(`Invalid ID: ${id} cannot be converted to integer`);
        }
        return parsed;
    }

    /**
     * Convert schedule object IDs to strings
     * @private
     * @param {Object|null} schedule - Schedule object from database
     * @returns {Object|null} Schedule with string IDs
     */
    _convertScheduleIds(schedule) {
        if (!schedule) return schedule;
        return {
            ...schedule,
            id: schedule.id?.toString(),
        };
    }

    /**
     * Find a schedule by script name
     *
     * @param {string} scriptName - The script name
     * @returns {Promise<Object|null>} Schedule record with string ID or null if not found
     */
    async findScheduleByScriptName(scriptName) {
        const schedule = await this.prisma.scriptSchedule.findUnique({
            where: { scriptName },
        });

        return this._convertScheduleIds(schedule);
    }

    /**
     * Create or update a schedule (upsert)
     *
     * @param {Object} params - Schedule parameters
     * @param {string} params.scriptName - Name of the script
     * @param {boolean} params.enabled - Whether schedule is enabled
     * @param {string} params.cronExpression - Cron expression
     * @param {string} [params.timezone] - Timezone (default 'UTC')
     * @param {string} [params.awsScheduleArn] - AWS EventBridge Scheduler ARN
     * @param {string} [params.awsScheduleName] - AWS EventBridge Scheduler name
     * @returns {Promise<Object>} Created or updated schedule record with string ID
     */
    async upsertSchedule({
        scriptName,
        enabled,
        cronExpression,
        timezone,
        awsScheduleArn,
        awsScheduleName,
    }) {
        const data = {
            enabled,
            cronExpression,
            timezone: timezone || 'UTC',
        };

        // Only set AWS fields if provided
        if (awsScheduleArn !== undefined) data.awsScheduleArn = awsScheduleArn;
        if (awsScheduleName !== undefined)
            data.awsScheduleName = awsScheduleName;

        const schedule = await this.prisma.scriptSchedule.upsert({
            where: { scriptName },
            update: data,
            create: {
                scriptName,
                ...data,
            },
        });

        return this._convertScheduleIds(schedule);
    }

    /**
     * Delete a schedule by script name
     *
     * @param {string} scriptName - The script name
     * @returns {Promise<Object>} Deletion result
     */
    async deleteSchedule(scriptName) {
        try {
            const schedule = await this.prisma.scriptSchedule.delete({
                where: { scriptName },
            });

            return {
                acknowledged: true,
                deletedCount: 1,
                deleted: this._convertScheduleIds(schedule),
            };
        } catch (error) {
            // Return 0 count if not found
            if (error.code === 'P2025') {
                return {
                    acknowledged: true,
                    deletedCount: 0,
                };
            }
            throw error;
        }
    }

    /**
     * Update AWS EventBridge Scheduler information
     *
     * @param {string} scriptName - The script name
     * @param {Object} awsInfo - AWS schedule information
     * @param {string} [awsInfo.awsScheduleArn] - AWS EventBridge Scheduler ARN
     * @param {string} [awsInfo.awsScheduleName] - AWS EventBridge Scheduler name
     * @returns {Promise<Object>} Updated schedule record with string ID
     */
    async updateScheduleAwsInfo(
        scriptName,
        { awsScheduleArn, awsScheduleName }
    ) {
        const data = {};
        if (awsScheduleArn !== undefined) data.awsScheduleArn = awsScheduleArn;
        if (awsScheduleName !== undefined)
            data.awsScheduleName = awsScheduleName;

        const schedule = await this.prisma.scriptSchedule.update({
            where: { scriptName },
            data,
        });

        return this._convertScheduleIds(schedule);
    }

    /**
     * Update last triggered timestamp
     *
     * @param {string} scriptName - The script name
     * @param {Date} [timestamp] - Trigger timestamp (default: now)
     * @returns {Promise<Object>} Updated schedule record with string ID
     */
    async updateScheduleLastTriggered(scriptName, timestamp) {
        const schedule = await this.prisma.scriptSchedule.update({
            where: { scriptName },
            data: {
                lastTriggeredAt: timestamp || new Date(),
            },
        });

        return this._convertScheduleIds(schedule);
    }

    /**
     * Update next trigger timestamp
     *
     * @param {string} scriptName - The script name
     * @param {Date} timestamp - Next trigger timestamp
     * @returns {Promise<Object>} Updated schedule record with string ID
     */
    async updateScheduleNextTrigger(scriptName, timestamp) {
        const schedule = await this.prisma.scriptSchedule.update({
            where: { scriptName },
            data: {
                nextTriggerAt: timestamp,
            },
        });

        return this._convertScheduleIds(schedule);
    }

    /**
     * List all schedules
     *
     * @param {Object} [options] - Query options
     * @param {boolean} [options.enabledOnly] - Only return enabled schedules
     * @returns {Promise<Array>} Array of schedule records with string IDs
     */
    async listSchedules(options = {}) {
        const where = {};
        if (options.enabledOnly) {
            where.enabled = true;
        }

        const schedules = await this.prisma.scriptSchedule.findMany({
            where,
            orderBy: { scriptName: 'asc' },
        });

        return schedules.map((schedule) => this._convertScheduleIds(schedule));
    }
}

module.exports = { ScriptScheduleRepositoryPostgres };
