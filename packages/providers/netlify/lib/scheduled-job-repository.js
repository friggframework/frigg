/**
 * Scheduled Job Repository
 *
 * Prisma-based implementation of the repository interface required by
 * NetlifySchedulerAdapter. Persists one-time scheduled jobs to the
 * ScheduledJob model so they survive function restarts.
 *
 * Repository interface:
 *   save(scheduleData)        — Upsert a scheduled job
 *   delete(scheduleName)      — Remove a scheduled job
 *   findByName(scheduleName)  — Find a single scheduled job
 *   findDue(now)              — Find all PENDING jobs where scheduledAt <= now
 */

class ScheduledJobRepository {
    /**
     * @param {Object} options
     * @param {import('@prisma/client').PrismaClient} options.prismaClient
     */
    constructor({ prismaClient }) {
        if (!prismaClient) {
            throw new Error(
                'ScheduledJobRepository requires a prismaClient instance'
            );
        }
        this.prisma = prismaClient;
    }

    async save(scheduleData) {
        return this.prisma.scheduledJob.upsert({
            where: { scheduleName: scheduleData.scheduleName },
            update: {
                scheduledAt: new Date(scheduleData.scheduledAt),
                queueResourceId: scheduleData.queueResourceId,
                payload: scheduleData.payload ?? undefined,
                state: scheduleData.state || 'PENDING',
            },
            create: {
                scheduleName: scheduleData.scheduleName,
                scheduledAt: new Date(scheduleData.scheduledAt),
                queueResourceId: scheduleData.queueResourceId,
                payload: scheduleData.payload ?? undefined,
                state: scheduleData.state || 'PENDING',
            },
        });
    }

    async delete(scheduleName) {
        try {
            await this.prisma.scheduledJob.delete({
                where: { scheduleName },
            });
        } catch (error) {
            // P2025 = record not found — safe to ignore on delete
            if (error.code !== 'P2025') {
                throw error;
            }
        }
    }

    async findByName(scheduleName) {
        return this.prisma.scheduledJob.findUnique({
            where: { scheduleName },
        });
    }

    async findDue(now) {
        return this.prisma.scheduledJob.findMany({
            where: {
                state: 'PENDING',
                scheduledAt: { lte: now },
            },
            orderBy: { scheduledAt: 'asc' },
        });
    }
}

module.exports = { ScheduledJobRepository };
