export interface ScheduleOneTimeParams {
    scheduleName: string;
    scheduleAt: Date;
    queueResourceId: string;
    payload: unknown;
}

export interface ScheduleOneTimeResult {
    scheduledJobId: string;
    scheduledAt: string;
}

export interface ScheduleStatusResult {
    exists: boolean;
    scheduledAt?: string | null;
    state?: string;
}

export class SchedulerServiceInterface {
    async scheduleOneTime(_params: ScheduleOneTimeParams): Promise<ScheduleOneTimeResult> {
        throw new Error('Method scheduleOneTime must be implemented by subclass');
    }

    async deleteSchedule(_scheduleName: string): Promise<void> {
        throw new Error('Method deleteSchedule must be implemented by subclass');
    }

    async getScheduleStatus(_scheduleName: string): Promise<ScheduleStatusResult> {
        throw new Error('Method getScheduleStatus must be implemented by subclass');
    }
}
