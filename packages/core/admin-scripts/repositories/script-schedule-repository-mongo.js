const { prisma } = require('../../database/prisma');
const {
    ScriptScheduleRepositoryInterface,
} = require('./script-schedule-repository-interface');

/**
 * MongoDB Script Schedule Repository Adapter
 * Handles script schedule persistence using Prisma with MongoDB
 *
 * MongoDB-specific characteristics:
 * - IDs are strings with @db.ObjectId
 * - scriptName has unique index
 * - Supports upsert operations natively
 */
class ScriptScheduleRepositoryMongo extends ScriptScheduleRepositoryInterface {
    constructor() {
        super();
        this.prisma = prisma;
    }

    /**
     * Find a schedule by script name
     *
     * @param {string} scriptName - The script name
     * @returns {Promise<Object|null>} Schedule record or null if not found
     */
    async findScheduleByScriptName(scriptName) {
        const schedule = await this.prisma.scriptSchedule.findUnique({
            where: { scriptName },
        });

        return schedule;
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
     * @returns {Promise<Object>} Created or updated schedule record
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

        return schedule;
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
                deleted: schedule,
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
     * @returns {Promise<Object>} Updated schedule record
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

        return schedule;
    }

    /**
     * Update last triggered timestamp
     *
     * @param {string} scriptName - The script name
     * @param {Date} [timestamp] - Trigger timestamp (default: now)
     * @returns {Promise<Object>} Updated schedule record
     */
    async updateScheduleLastTriggered(scriptName, timestamp) {
        const schedule = await this.prisma.scriptSchedule.update({
            where: { scriptName },
            data: {
                lastTriggeredAt: timestamp || new Date(),
            },
        });

        return schedule;
    }

    /**
     * Update next trigger timestamp
     *
     * @param {string} scriptName - The script name
     * @param {Date} timestamp - Next trigger timestamp
     * @returns {Promise<Object>} Updated schedule record
     */
    async updateScheduleNextTrigger(scriptName, timestamp) {
        const schedule = await this.prisma.scriptSchedule.update({
            where: { scriptName },
            data: {
                nextTriggerAt: timestamp,
            },
        });

        return schedule;
    }

    /**
     * List all schedules
     *
     * @param {Object} [options] - Query options
     * @param {boolean} [options.enabledOnly] - Only return enabled schedules
     * @returns {Promise<Array>} Array of schedule records
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

        return schedules;
    }
}

module.exports = { ScriptScheduleRepositoryMongo };
