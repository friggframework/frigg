import { SchedulerServiceInterface } from './scheduler-service-interface';
import type { ScheduleOneTimeParams, ScheduleOneTimeResult, ScheduleStatusResult } from './scheduler-service-interface';

interface ScheduleData {
    scheduleName: string;
    scheduledAt: string;
    queueResourceId: string;
    payload: unknown;
    createdAt: string;
    state: string;
}

export class MockSchedulerAdapter extends SchedulerServiceInterface {
    private verbose: boolean;
    private schedules: Map<string, ScheduleData>;

    constructor(options: { verbose?: boolean } = {}) {
        super();
        this.verbose = options.verbose || false;
        this.schedules = new Map();
    }

    async scheduleOneTime({ scheduleName, scheduleAt, queueResourceId, payload }: ScheduleOneTimeParams): Promise<ScheduleOneTimeResult> {
        if (!scheduleName) {
            throw new Error('scheduleName is required');
        }
        if (!scheduleAt || !(scheduleAt instanceof Date)) {
            throw new TypeError('scheduleAt must be a valid Date object');
        }
        if (!queueResourceId) {
            throw new Error('queueResourceId is required');
        }

        const scheduleData: ScheduleData = {
            scheduleName,
            scheduledAt: scheduleAt.toISOString(),
            queueResourceId,
            payload,
            createdAt: new Date().toISOString(),
            state: 'ENABLED',
        };

        this.schedules.set(scheduleName, scheduleData);

        console.log(`[MockScheduler] Created schedule: ${scheduleName}`);
        console.log(`[MockScheduler]   Scheduled for: ${scheduleAt.toISOString()}`);
        console.log(`[MockScheduler]   Target: ${queueResourceId}`);
        if (this.verbose) {
            console.log(`[MockScheduler]   Payload:`, JSON.stringify(payload, null, 2));
        }

        return {
            scheduledJobId: `mock-job-${scheduleName}`,
            scheduledAt: scheduleAt.toISOString(),
        };
    }

    async deleteSchedule(scheduleName: string): Promise<void> {
        if (!scheduleName) {
            throw new Error('scheduleName is required');
        }

        const existed = this.schedules.has(scheduleName);
        this.schedules.delete(scheduleName);

        console.log(`[MockScheduler] Deleted schedule: ${scheduleName} (existed: ${existed})`);
    }

    async getScheduleStatus(scheduleName: string): Promise<ScheduleStatusResult> {
        if (!scheduleName) {
            throw new Error('scheduleName is required');
        }

        const schedule = this.schedules.get(scheduleName);

        if (!schedule) {
            return { exists: false };
        }

        return {
            exists: true,
            scheduledAt: schedule.scheduledAt,
            state: schedule.state,
        };
    }

    _getSchedules(): Record<string, ScheduleData> {
        return Object.fromEntries(this.schedules);
    }

    _clearSchedules(): void {
        const count = this.schedules.size;
        this.schedules.clear();
        console.log(`[MockScheduler] Cleared ${count} schedules`);
    }

    _simulateTrigger(scheduleName: string): unknown | null {
        const schedule = this.schedules.get(scheduleName);
        if (!schedule) {
            console.log(`[MockScheduler] Cannot trigger - schedule not found: ${scheduleName}`);
            return null;
        }

        console.log(`[MockScheduler] Simulating trigger for: ${scheduleName}`);
        console.log(`[MockScheduler]   Payload:`, JSON.stringify(schedule.payload, null, 2));

        return schedule.payload;
    }
}
