interface SentinelTimeoutError extends Error {
    isSentinelTimeout: true;
}

export interface TimeoutCatcherOptions {
    work: () => Promise<unknown>;
    timeout: number;
    cleanUp?: () => void | Promise<void>;
    cleanUpTime?: number;
}

const isPositive = (n: number): boolean => Number.isFinite(n) && n > 0;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class TimeoutCatcher {
    isFinished: boolean;
    waitTime: number;
    private readonly work: () => Promise<unknown>;
    private readonly cleanUp: () => void | Promise<void>;

    constructor({ work, timeout, cleanUp = () => {}, cleanUpTime = 2_000 }: TimeoutCatcherOptions) {
        this.isFinished = false;
        this.work = work;
        this.cleanUp = cleanUp;
        this.waitTime = timeout - cleanUpTime;

        if (!isPositive(this.waitTime))
            throw new Error('Wait time was not a positive number of milliseconds');
    }

    async watch(): Promise<boolean> {
        try {
            await Promise.race([this.doWork(), this.exitBeforeTimeout()]);
            return true;
        } catch (error) {
            if ((error as SentinelTimeoutError).isSentinelTimeout) return false;
            throw error;
        }
    }

    async doWork(): Promise<void> {
        await this.work();
        this.isFinished = true;
    }

    async exitBeforeTimeout(): Promise<void> {
        await sleep(this.waitTime);

        if (!this.isFinished) {
            await this.cleanUp();

            const error = new Error('Sentinel Timed Out') as SentinelTimeoutError;
            error.isSentinelTimeout = true;
            throw error;
        }
    }
}
