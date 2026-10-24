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
 *   findDue(now, { leaseMs }) — Find due jobs: PENDING, or PROCESSING with an
 *                               expired lease (a dispatcher that died after
 *                               claiming), where scheduledAt <= now
 *   claim(scheduleName, now, { leaseMs })
 *                             — Atomically move one due job to PROCESSING;
 *                               true only for the one caller that won it
 *
 * The lease clock is the row's updatedAt: a claim writes it, so a PROCESSING
 * row whose updatedAt is older than now - leaseMs is claimable again.
 */

const DEFAULT_LEASE_MS = 5 * 60 * 1000;

// Rows a dispatcher may take: never claimed, or claimed by one that has not
// finished within the lease.
function claimableWhere(now, leaseMs = DEFAULT_LEASE_MS) {
    return {
        OR: [
            { state: 'PENDING' },
            {
                state: 'PROCESSING',
                updatedAt: { lt: new Date(now.getTime() - leaseMs) },
            },
        ],
    };
}

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

    async findDue(now, { leaseMs = DEFAULT_LEASE_MS } = {}) {
        return this.prisma.scheduledJob.findMany({
            where: {
                scheduledAt: { lte: now },
                ...claimableWhere(now, leaseMs),
            },
            orderBy: { scheduledAt: 'asc' },
        });
    }

    /**
     * Conditional update: only a row that is still claimable moves to
     * PROCESSING, so of two overlapping ticks exactly one gets count === 1.
     * (PostgreSQL re-checks the WHERE on the row it locked; MongoDB updates
     * each document atomically.)
     *
     * @returns {Promise<boolean>} true when this caller claimed the job
     */
    async claim(scheduleName, now, { leaseMs = DEFAULT_LEASE_MS } = {}) {
        const { count } = await this.prisma.scheduledJob.updateMany({
            where: { scheduleName, ...claimableWhere(now, leaseMs) },
            data: { state: 'PROCESSING', updatedAt: now },
        });
        return count === 1;
    }
}

module.exports = { ScheduledJobRepository, DEFAULT_LEASE_MS };
