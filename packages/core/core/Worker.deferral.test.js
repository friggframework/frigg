const { mockClient } = require('aws-sdk-client-mock');
const {
    ChangeMessageVisibilityCommand,
    GetQueueUrlCommand,
    SQSClient,
    SendMessageCommand,
} = require('@aws-sdk/client-sqs');
const {
    CreateScheduleCommand,
    SchedulerClient,
} = require('@aws-sdk/client-scheduler');
const { Worker } = require('./Worker');
const { RateLimitError } = require('../errors');
const { createMemorySink } = require('../logs');
const {
    MAX_DEFERRALS_ENV,
    MAX_DEFERRED_MS,
    MAX_DEFERRED_MS_ENV,
} = require('../queues/queue-deferral');

const NOW = Date.parse('2026-09-28T12:00:00.000Z');
const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

const QUEUE_NAME = 'app--dev-ExampleQueue';
const QUEUE_ARN = `arn:aws:sqs:us-east-1:123456789012:${QUEUE_NAME}`;
const QUEUE_URL = `https://sqs.us-east-1.amazonaws.com/123456789012/${QUEUE_NAME}`;
const SCHEDULER_ROLE_ARN =
    'arn:aws:iam::123456789012:role/app-dev-scheduler-role';
const BODY = { event: 'SYNC_PAGE', data: { processId: 7 } };

const ENV_KEYS = [
    'AWS_ENDPOINT',
    'FRIGG_QUEUE_MAX_RECEIVE_COUNT',
    'IS_OFFLINE',
    'SCHEDULE_GROUP_NAME',
    'SCHEDULER_PROVIDER',
    'SCHEDULER_ROLE_ARN',
    MAX_DEFERRALS_ENV,
    MAX_DEFERRED_MS_ENV,
];

function rateLimited(waitMs, { reason = 'burst', module = 'hubspot' } = {}) {
    return new RateLimitError({
        resource: 'https://api.example.com/v1/items',
        response: { status: 429, bodyUsed: true },
        hint: { waitMs, reason, source: 'header' },
        waitMs,
        module,
        now: NOW,
    });
}

function sqsRecord(overrides = {}) {
    return {
        messageId: 'msg-1',
        receiptHandle: 'receipt-1',
        eventSourceARN: QUEUE_ARN,
        attributes: { ApproximateReceiveCount: '1' },
        body: JSON.stringify(BODY),
        ...overrides,
    };
}

function deferredBody(
    deferrals,
    firstDeferredAt = new Date(NOW).toISOString()
) {
    return { ...BODY, _frigg: { deferrals, firstDeferredAt } };
}

function deferredRecord(deferrals, firstDeferredAt) {
    return sqsRecord({
        body: JSON.stringify(deferredBody(deferrals, firstDeferredAt)),
    });
}

describe('Worker rate-limit deferral (ADR-049)', () => {
    let sqsMock;
    let schedulerMock;
    let sink;
    let worker;
    let savedEnv;

    beforeEach(() => {
        savedEnv = {};
        for (const key of ENV_KEYS) {
            savedEnv[key] = process.env[key];
            delete process.env[key];
        }
        jest.spyOn(Date, 'now').mockReturnValue(NOW);
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        sqsMock = mockClient(SQSClient);
        schedulerMock = mockClient(SchedulerClient);
        sqsMock.on(GetQueueUrlCommand).resolves({ QueueUrl: QUEUE_URL });
        sqsMock.on(SendMessageCommand).resolves({ MessageId: 'new-message' });
        sqsMock.on(ChangeMessageVisibilityCommand).resolves({});
        schedulerMock.on(CreateScheduleCommand).resolves({
            ScheduleArn:
                'arn:aws:scheduler:us-east-1:123456789012:schedule/g/n',
        });
        sink = createMemorySink();
        worker = new Worker();
        worker._run = jest.fn();
    });

    afterEach(() => {
        jest.restoreAllMocks();
        sqsMock.restore();
        schedulerMock.restore();
        for (const key of ENV_KEYS) {
            if (savedEnv[key] === undefined) delete process.env[key];
            else process.env[key] = savedEnv[key];
        }
    });

    const sent = () =>
        sqsMock
            .commandCalls(SendMessageCommand)
            .map((call) => call.args[0].input);
    const sentBody = (index = 0) => JSON.parse(sent()[index].MessageBody);
    const visibility = () =>
        sqsMock
            .commandCalls(ChangeMessageVisibilityCommand)
            .map((call) => call.args[0].input);
    const schedules = () =>
        schedulerMock
            .commandCalls(CreateScheduleCommand)
            .map((call) => call.args[0].input);
    const logged = (name) =>
        sink.records.filter((r) => r.eventName === `frigg.worker.${name}`);
    const run = (record = sqsRecord()) => worker.run({ Records: [record] });
    const failure = (id = 'msg-1') => ({
        batchItemFailures: [{ itemIdentifier: id }],
    });

    describe('a wait of up to 15 minutes', () => {
        it('puts the message back with DelaySeconds and a deferral counter, and reports it handled', async () => {
            worker._run.mockRejectedValue(rateLimited(60 * SECOND));

            const result = await run();

            expect(result).toEqual({ batchItemFailures: [] });
            expect(sent()).toHaveLength(1);
            expect(sent()[0]).toMatchObject({
                QueueUrl: QUEUE_URL,
                DelaySeconds: 60,
            });
            expect(sentBody()).toEqual(deferredBody(1));
            expect(worker._run).toHaveBeenCalledTimes(1);
        });

        it('rounds the delay up to whole seconds', async () => {
            worker._run.mockRejectedValue(rateLimited(1_500));
            await run();
            expect(sent()[0].DelaySeconds).toBe(2);
        });

        it('sends with a delay of 900 seconds for a wait of exactly 15 minutes', async () => {
            worker._run.mockRejectedValue(rateLimited(15 * MINUTE));
            await run();
            expect(sent()[0].DelaySeconds).toBe(900);
            expect(schedules()).toEqual([]);
        });

        it('sends with no delay when the retry time has passed', async () => {
            const error = new RateLimitError({
                resource: 'https://api.example.com/v1/items',
                response: { status: 429, bodyUsed: true },
                hint: { retryAt: new Date(NOW - 5 * SECOND), source: 'header' },
                now: NOW,
            });
            worker._run.mockRejectedValue(error);

            await run();

            expect(sent()[0].DelaySeconds).toBe(0);
        });

        it('counts up and keeps the first deferral time on a message that was deferred before', async () => {
            const firstDeferredAt = new Date(NOW - 10 * MINUTE).toISOString();
            worker._run.mockRejectedValue(rateLimited(60 * SECOND));

            await run(deferredRecord(2, firstDeferredAt));

            expect(sentBody()._frigg).toEqual({
                deferrals: 3,
                firstDeferredAt,
            });
        });

        it('looks the queue URL up from the event source ARN, once per queue', async () => {
            worker._run.mockRejectedValue(rateLimited(60 * SECOND));

            await worker.run({
                Records: [sqsRecord(), sqsRecord({ messageId: 'msg-2' })],
            });

            const lookups = sqsMock.commandCalls(GetQueueUrlCommand);
            expect(lookups).toHaveLength(1);
            expect(lookups[0].args[0].input).toEqual({ QueueName: QUEUE_NAME });
            expect(sent()).toHaveLength(2);
        });

        it('tries the queue URL lookup again after it failed', async () => {
            sqsMock
                .on(GetQueueUrlCommand)
                .rejectsOnce(new Error('throttled'))
                .resolves({ QueueUrl: QUEUE_URL });
            worker._run.mockRejectedValue(rateLimited(60 * SECOND));

            const result = await worker.run({
                Records: [sqsRecord(), sqsRecord({ messageId: 'msg-2' })],
            });

            expect(result).toEqual(failure('msg-1'));
            expect(sent()).toHaveLength(1);
        });

        it('hands the deferred message to _run with the counters and a fresh delivery', async () => {
            const firstDeferredAt = new Date(NOW - MINUTE).toISOString();
            worker._run.mockResolvedValue(undefined);

            await run(deferredRecord(1, firstDeferredAt));

            expect(worker._run).toHaveBeenCalledWith(
                deferredBody(1, firstDeferredAt),
                {},
                expect.objectContaining({ receiveCount: 1 })
            );
        });
    });

    describe('a wait over 15 minutes', () => {
        beforeEach(() => {
            process.env.SCHEDULER_ROLE_ARN = SCHEDULER_ROLE_ARN;
        });

        it('schedules the message at the retry time with the one-time scheduler', async () => {
            process.env.SCHEDULE_GROUP_NAME = 'app-dev-schedules';
            worker._run.mockRejectedValue(rateLimited(20 * MINUTE));

            const result = await run();

            expect(result).toEqual({ batchItemFailures: [] });
            expect(sent()).toEqual([]);
            expect(schedules()).toHaveLength(1);
            const [schedule] = schedules();
            expect(schedule).toMatchObject({
                Name: 'frigg-defer-msg-1',
                GroupName: 'app-dev-schedules',
                ScheduleExpression: 'at(2026-09-28T12:20:00)',
                ActionAfterCompletion: 'DELETE',
                Target: { Arn: QUEUE_ARN, RoleArn: SCHEDULER_ROLE_ARN },
            });
            expect(JSON.parse(schedule.Target.Input)).toEqual(deferredBody(1));
        });

        it('takes a schedule that exists already as scheduled', async () => {
            schedulerMock
                .on(CreateScheduleCommand)
                .rejects(
                    Object.assign(new Error('exists'), {
                        name: 'ConflictException',
                    })
                );
            worker._run.mockRejectedValue(rateLimited(20 * MINUTE));

            const result = await run();

            expect(result).toEqual({ batchItemFailures: [] });
            expect(visibility()).toEqual([]);
        });

        it('extends the visibility timeout when the schedule cannot be created, and reports the record failed', async () => {
            schedulerMock
                .on(CreateScheduleCommand)
                .rejects(new Error('scheduler is down'));
            worker._run.mockRejectedValue(rateLimited(20 * MINUTE));

            const result = await run();

            expect(result).toEqual(failure());
            expect(visibility()).toEqual([
                {
                    QueueUrl: QUEUE_URL,
                    ReceiptHandle: 'receipt-1',
                    VisibilityTimeout: 1200,
                },
            ]);
            expect(logged('record_visibility_extended')).toEqual([
                expect.objectContaining({
                    scheduleError: expect.stringContaining('scheduler is down'),
                }),
            ]);
        });

        it('never uses the mock scheduler, even when the environment names it', async () => {
            process.env.SCHEDULER_PROVIDER = 'mock';
            worker._run.mockRejectedValue(rateLimited(20 * MINUTE));

            const result = await run();

            expect(result).toEqual(failure());
            expect(schedules()).toEqual([]);
            expect(visibility()).toHaveLength(1);
        });
    });

    describe('a wait over 15 minutes with no scheduler', () => {
        it('extends the visibility timeout to the retry time and reports the record failed', async () => {
            worker._run.mockRejectedValue(rateLimited(20 * MINUTE));

            const result = await run();

            expect(result).toEqual(failure());
            expect(sent()).toEqual([]);
            expect(visibility()).toEqual([
                {
                    QueueUrl: QUEUE_URL,
                    ReceiptHandle: 'receipt-1',
                    VisibilityTimeout: 1200,
                },
            ]);
        });

        it('keeps the visibility timeout 20 minutes under the 12 hours that SQS counts from the receive', async () => {
            process.env[MAX_DEFERRED_MS_ENV] = String(48 * HOUR);
            worker._run.mockRejectedValue(rateLimited(13 * HOUR));

            await run();

            expect(visibility()[0].VisibilityTimeout).toBe(42_000);
        });

        it('leaves the message to SQS when the visibility change fails', async () => {
            sqsMock
                .on(ChangeMessageVisibilityCommand)
                .rejects(new Error('gone'));
            worker._run.mockRejectedValue(rateLimited(20 * MINUTE));

            const result = await run();

            expect(result).toEqual(failure());
            expect(logged('record_failed')).toEqual([
                expect.objectContaining({
                    deferral: {
                        skipped: 'visibility_failed',
                        cause: expect.stringContaining('gone'),
                    },
                }),
            ]);
        });
    });

    describe('the caps', () => {
        it('reports the record failed, and sends nothing, past the deferral count', async () => {
            process.env[MAX_DEFERRALS_ENV] = '2';
            const firstDeferredAt = new Date(NOW - MINUTE).toISOString();
            worker._run.mockRejectedValue(rateLimited(60 * SECOND));

            const result = await run(deferredRecord(2, firstDeferredAt));

            expect(result).toEqual(failure());
            expect(sent()).toEqual([]);
            expect(logged('record_deferral_capped')).toEqual([
                expect.objectContaining({
                    level: 'WARN',
                    deferrals: 3,
                    maxDeferrals: 2,
                }),
            ]);
            expect(logged('record_failed')).toEqual([]);
        });

        it('reports the record failed when the retry time is past the total time', async () => {
            worker._run.mockRejectedValue(rateLimited(MAX_DEFERRED_MS + HOUR));

            const result = await run();

            expect(result).toEqual(failure());
            expect(sent()).toEqual([]);
            expect(visibility()).toEqual([]);
            expect(logged('record_deferral_capped')).toHaveLength(1);
        });

        it('counts the total time from the first deferral', async () => {
            const firstDeferredAt = new Date(
                NOW - (MAX_DEFERRED_MS - HOUR)
            ).toISOString();
            worker._run.mockRejectedValue(rateLimited(2 * HOUR));

            const result = await run(deferredRecord(1, firstDeferredAt));

            expect(result).toEqual(failure());
            expect(logged('record_deferral_capped')).toHaveLength(1);
        });

        it('writes an ERROR when a capped message is on its last delivery', async () => {
            process.env.FRIGG_QUEUE_MAX_RECEIVE_COUNT = '3';
            worker._run.mockRejectedValue(rateLimited(MAX_DEFERRED_MS + HOUR));

            await run(
                sqsRecord({ attributes: { ApproximateReceiveCount: '3' } })
            );

            expect(logged('record_lost_rate_limited')).toEqual([
                expect.objectContaining({
                    level: 'ERROR',
                    receiveCount: 3,
                    reason: 'burst',
                }),
            ]);
        });

        it('writes no lost-message ERROR before the last delivery', async () => {
            process.env.FRIGG_QUEUE_MAX_RECEIVE_COUNT = '3';
            worker._run.mockRejectedValue(rateLimited(MAX_DEFERRED_MS + HOUR));

            await run(
                sqsRecord({ attributes: { ApproximateReceiveCount: '2' } })
            );

            expect(logged('record_lost_rate_limited')).toEqual([]);
        });
    });

    describe('a rate-limit error that cannot be deferred', () => {
        it('goes back to SQS as before when it has no retry time', async () => {
            worker._run.mockRejectedValue(
                Object.assign(new Error('limited'), { isRateLimited: true })
            );

            const result = await run();

            expect(result).toEqual(failure());
            expect(sent()).toEqual([]);
            expect(logged('record_failed')).toEqual([
                expect.objectContaining({
                    deferral: { skipped: 'no_retry_at' },
                }),
            ]);
        });

        it.each([
            ['no event source ARN', { eventSourceARN: undefined }],
            ['a FIFO queue', { eventSourceARN: `${QUEUE_ARN}.fifo` }],
        ])('goes back to SQS as before with %s', async (_label, overrides) => {
            worker._run.mockRejectedValue(rateLimited(60 * SECOND));

            const result = await run(sqsRecord(overrides));

            expect(result).toEqual(failure());
            expect(sent()).toEqual([]);
            expect(logged('record_failed')).toEqual([
                expect.objectContaining({
                    deferral: { skipped: 'no_event_source' },
                }),
            ]);
        });

        it('goes back to SQS, and is not lost, when the send fails', async () => {
            sqsMock.on(SendMessageCommand).rejects(new Error('SQS is down'));
            worker._run.mockRejectedValue(rateLimited(60 * SECOND));

            const result = await run();

            expect(result).toEqual(failure());
            expect(logged('record_failed')).toEqual([
                expect.objectContaining({
                    deferral: {
                        skipped: 'send_failed',
                        cause: expect.stringContaining('SQS is down'),
                    },
                }),
            ]);
        });

        it('goes back to SQS when the message body is not JSON', async () => {
            worker._run.mockRejectedValue(rateLimited(60 * SECOND));

            const result = await run(sqsRecord({ body: 'not json' }));

            expect(result).toEqual(failure());
            expect(sent()).toEqual([]);
        });

        it('does not touch an error that is not a rate limit', async () => {
            worker._run.mockRejectedValue(new Error('boom'));

            const result = await run();

            expect(result).toEqual(failure());
            expect(sent()).toEqual([]);
            expect(logged('record_failed')[0].deferral).toBeUndefined();
        });
    });

    describe('logging', () => {
        it('writes one WARN record_deferred with the wait, the times and the counters', async () => {
            worker._run.mockRejectedValue(
                rateLimited(60 * SECOND, { reason: 'daily' })
            );

            await run(
                sqsRecord({ attributes: { ApproximateReceiveCount: '2' } })
            );

            expect(logged('record_deferred')).toEqual([
                expect.objectContaining({
                    level: 'WARN',
                    logger: 'frigg.worker',
                    messageId: 'msg-1',
                    receiveCount: 2,
                    mechanism: 'delay',
                    waitMs: 60_000,
                    delaySeconds: 60,
                    retryAt: new Date(NOW + 60_000).toISOString(),
                    deferrals: 1,
                    firstDeferredAt: new Date(NOW).toISOString(),
                    reason: 'daily',
                    module: 'hubspot',
                    statusCode: 429,
                    error: expect.objectContaining({ type: 'RateLimitError' }),
                }),
            ]);
            expect(logged('record_failed')).toEqual([]);
        });

        it('names the schedule when the message was scheduled', async () => {
            process.env.SCHEDULER_ROLE_ARN = SCHEDULER_ROLE_ARN;
            worker._run.mockRejectedValue(rateLimited(20 * MINUTE));

            await run();

            expect(logged('record_deferred')).toEqual([
                expect.objectContaining({
                    mechanism: 'schedule',
                    scheduleName: 'frigg-defer-msg-1',
                }),
            ]);
        });

        it('writes one WARN record_visibility_extended and no record_failed', async () => {
            worker._run.mockRejectedValue(rateLimited(20 * MINUTE));

            await run();

            expect(logged('record_visibility_extended')).toEqual([
                expect.objectContaining({
                    level: 'WARN',
                    mechanism: 'visibility',
                    visibilityTimeout: 1200,
                    waitMs: 20 * MINUTE,
                }),
            ]);
            expect(logged('record_failed')).toEqual([]);
        });
    });

    describe('the run state hooks', () => {
        beforeEach(() => {
            worker.recordRateLimitWait = jest.fn().mockResolvedValue(undefined);
            worker.clearRateLimitWait = jest.fn().mockResolvedValue(undefined);
        });

        it('records the wait after the message was put back', async () => {
            worker._run.mockRejectedValue(rateLimited(60 * SECOND));

            await run();

            expect(worker.recordRateLimitWait).toHaveBeenCalledTimes(1);
            const [body, error, state] =
                worker.recordRateLimitWait.mock.calls[0];
            expect(body).toEqual(BODY);
            expect(error).toBeInstanceOf(RateLimitError);
            expect(state).toEqual({
                status: 'WAITING',
                mechanism: 'delay',
                deferrals: 1,
                retryAt: new Date(NOW + 60_000),
            });
        });

        it('records nothing when the message could not be put back', async () => {
            sqsMock.on(SendMessageCommand).rejects(new Error('SQS is down'));
            worker._run.mockRejectedValue(rateLimited(60 * SECOND));

            await run();

            expect(worker.recordRateLimitWait).not.toHaveBeenCalled();
        });

        it('records EXHAUSTED when a cap ended the deferrals', async () => {
            worker._run.mockRejectedValue(rateLimited(MAX_DEFERRED_MS + HOUR));

            await run();

            expect(worker.recordRateLimitWait.mock.calls[0][2]).toMatchObject({
                status: 'EXHAUSTED',
            });
        });

        it('records EXHAUSTED for a visibility change on the last delivery', async () => {
            process.env.FRIGG_QUEUE_MAX_RECEIVE_COUNT = '3';
            worker._run.mockRejectedValue(rateLimited(20 * MINUTE));

            await run(
                sqsRecord({ attributes: { ApproximateReceiveCount: '3' } })
            );

            expect(worker.recordRateLimitWait.mock.calls[0][2]).toMatchObject({
                status: 'EXHAUSTED',
                mechanism: 'visibility',
            });
        });

        it('clears the wait after a deferred message succeeds', async () => {
            worker._run.mockResolvedValue(undefined);

            await run(deferredRecord(1));

            expect(worker.clearRateLimitWait).toHaveBeenCalledWith(
                deferredBody(1)
            );
        });

        it('clears the wait after a redelivered message succeeds', async () => {
            worker._run.mockResolvedValue(undefined);

            await run(
                sqsRecord({ attributes: { ApproximateReceiveCount: '2' } })
            );

            expect(worker.clearRateLimitWait).toHaveBeenCalledWith(BODY);
        });

        it('does not clear anything after a first delivery', async () => {
            worker._run.mockResolvedValue(undefined);

            await run();

            expect(worker.clearRateLimitWait).not.toHaveBeenCalled();
        });

        it('logs a failing hook and still reports the message handled', async () => {
            worker.recordRateLimitWait.mockRejectedValue(
                new Error('database is down')
            );
            worker._run.mockRejectedValue(rateLimited(60 * SECOND));

            const result = await run();

            expect(result).toEqual({ batchItemFailures: [] });
            expect(logged('rate_limit_state_failed')).toEqual([
                expect.objectContaining({
                    level: 'WARN',
                    operation: 'record',
                    error: expect.objectContaining({
                        message: 'database is down',
                    }),
                }),
            ]);
        });

        it('logs a failing clear and still counts the message a success', async () => {
            worker.clearRateLimitWait.mockRejectedValue(
                new Error('database is down')
            );
            worker._run.mockResolvedValue(undefined);

            const result = await run(
                sqsRecord({ attributes: { ApproximateReceiveCount: '2' } })
            );

            expect(result).toEqual({ batchItemFailures: [] });
            expect(logged('rate_limit_state_failed')).toEqual([
                expect.objectContaining({ operation: 'clear' }),
            ]);
        });
    });

    describe('the SQS client', () => {
        it('is built with the offline and endpoint options', () => {
            process.env.AWS_ENDPOINT = 'http://localhost:4566';
            process.env.IS_OFFLINE = 'true';
            const constructed = [];

            jest.isolateModules(() => {
                jest.doMock('@aws-sdk/client-sqs', () => ({
                    ...jest.requireActual('@aws-sdk/client-sqs'),
                    SQSClient: jest.fn((config) => {
                        constructed.push(config);
                        return { send: jest.fn() };
                    }),
                }));
                require('./Worker');
            });

            expect(constructed.length).toBeGreaterThan(0);
            for (const config of constructed) {
                expect(config).toMatchObject({
                    endpoint: 'http://localhost:4566',
                    region: 'us-east-1',
                });
            }
        });
    });
});
