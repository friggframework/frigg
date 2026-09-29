const { randomUUID } = require('node:crypto');
const {
    SQSClient,
    GetQueueUrlCommand,
    SendMessageCommand,
    ChangeMessageVisibilityCommand,
} = require('@aws-sdk/client-sqs');
const _ = require('lodash');
const { RequiredPropertyError } = require('../errors');
const { get } = require('../assertions');
const { readQueueDelivery } = require('../queues/queue-delivery');
const { awsConfigOptions } = require('../queues/queuer-util');
const {
    MAX_DELAY_SECONDS,
    MAX_VISIBILITY_TIMEOUT_SECONDS,
    isDeferralCapped,
    nextDeferral,
    readDeferral,
    readDeferralLimits,
    withDeferral,
} = require('../queues/queue-deferral');
const { runMessageScope } = require('./invocation-scope');
const { getLogger, serializeError } = require('../logs');

const sqs = new SQSClient({
    region: process.env.AWS_REGION,
    ...awsConfigOptions(),
});
const log = getLogger('frigg.worker');

const validDate = (value) =>
    value instanceof Date && !Number.isNaN(value.getTime()) ? value : null;
const queueNameOf = (arn) =>
    typeof arn === 'string' && arn ? arn.split(':').pop() : undefined;
const causeOf = (error) => serializeError(error).message;

class Worker {
    async getQueueURL(params) {
        // Passing params in because there will be multiple QueueNames
        // let params = {
        //     QueueName:  process.env.QueueName
        // };
        const command = new GetQueueUrlCommand(params);
        const data = await sqs.send(command);
        return data.QueueUrl;
    }

    async run(params, context = {}) {
        const records = get(params, 'Records');
        const batchItemFailures = [];

        console.log(
            `[Worker] run: processing ${records.length} record(s)`
        );

        for (const record of records) {
            await runMessageScope(record, async () => {
                // messageId, receiveCount and the event come from the scope.
                log.debug('Record started', { eventName: 'frigg.worker.record_started' });

                const delivery = readQueueDelivery(record);
                let runParams;
                try {
                    runParams = JSON.parse(record.body);
                    this._validateParams(runParams);
                    await this._run(runParams, context, delivery);
                    await this._clearDeferredState(runParams, delivery);
                    log.debug('Record succeeded', { eventName: 'frigg.worker.record_succeeded' });
                } catch (error) {
                    let deferral;
                    if (error.isRateLimited && runParams) {
                        deferral = await this.defer(
                            record,
                            runParams,
                            error,
                            delivery
                        );
                        if (deferral.outcome === 'acked') return;
                        if (deferral.outcome === 'failed') {
                            batchItemFailures.push({
                                itemIdentifier: record.messageId,
                            });
                            return;
                        }
                    }
                    if (error.isHaltError) {
                        // HaltError means "discard this message, don't retry".
                        // Treat as success so SQS deletes it from the queue.
                        // Logged explicitly — silent discards made prod debugging
                        // extremely hard; keep this visible.
                        log.error('Record halted (discarded, no retry)', {
                            eventName: 'frigg.worker.record_halted',
                            statusCode: error.statusCode,
                            error,
                        });
                        return;
                    }
                    // The message goes back to SQS, so WARN (ADR-048 §4).
                    log.warn('Record failed, returned for retry', {
                        eventName: 'frigg.worker.record_failed',
                        error,
                        ...(deferral && {
                            deferral: {
                                skipped: deferral.skipped,
                                ...(deferral.cause && {
                                    cause: causeOf(deferral.cause),
                                }),
                            },
                        }),
                    });
                    batchItemFailures.push({ itemIdentifier: record.messageId });
                }
            });
        }

        if (batchItemFailures.length > 0) {
            console.warn(
                `[Worker] run: returning ${batchItemFailures.length} batchItemFailure(s) of ${records.length}`
            );
        }

        return { batchItemFailures };
    }

    async _run(params, context = {}) {
        // validate params and instantiate any class to do work based on the
        // parameters
    }

    async defer(record, body, error, delivery) {
        const retryAt = validDate(error.retryAt);
        if (!retryAt) return { outcome: 'skipped', skipped: 'no_retry_at' };
        const queueName = queueNameOf(record.eventSourceARN);
        if (!queueName || queueName.endsWith('.fifo')) {
            return { outcome: 'skipped', skipped: 'no_event_source' };
        }

        const now = Date.now();
        const waitMs = Math.max(0, retryAt.getTime() - now);
        const deferral = nextDeferral(body, now);
        const details = {
            waitMs,
            retryAt: retryAt.toISOString(),
            deferrals: deferral.deferrals,
            firstDeferredAt: deferral.firstDeferredAt,
            reason: error.reason,
            module: error.module,
            statusCode: error.statusCode,
        };
        const state = (status, mechanism) => ({
            status,
            mechanism,
            deferrals: deferral.deferrals,
            retryAt,
        });

        const limits = readDeferralLimits();
        if (isDeferralCapped({ ...deferral, retryAt }, limits)) {
            log.warn('Rate-limit deferral capped', {
                eventName: 'frigg.worker.record_deferral_capped',
                ...details,
                maxDeferrals: limits.maxDeferrals,
                maxDeferredMs: limits.maxDeferredMs,
                deferredMs:
                    retryAt.getTime() - Date.parse(deferral.firstDeferredAt),
                error,
            });
            await this._recordWait(body, error, state('EXHAUSTED', 'none'));
            this._logIfLost(delivery, error, details);
            return { outcome: 'failed' };
        }

        const tier = {
            record,
            queueName,
            body,
            next: withDeferral(body, deferral),
            error,
            delivery,
            retryAt,
            waitMs,
            details,
            state,
        };
        if (waitMs <= MAX_DELAY_SECONDS * 1000)
            return this._deferWithDelay(tier);
        const scheduled = await this._deferWithSchedule(tier);
        if (scheduled?.outcome) return scheduled;
        return this._deferWithVisibility({
            ...tier,
            scheduleError: scheduled?.scheduleError,
        });
    }

    async _deferWithDelay({
        queueName,
        body,
        next,
        error,
        waitMs,
        details,
        state,
    }) {
        const delaySeconds = Math.ceil(waitMs / 1000);
        try {
            const queueUrl = await this._queueUrl(queueName);
            await this.send({ ...next, QueueUrl: queueUrl }, delaySeconds);
        } catch (cause) {
            return { outcome: 'skipped', skipped: 'send_failed', cause };
        }
        await this._recordWait(body, error, state('WAITING', 'delay'));
        log.warn('Record deferred', {
            eventName: 'frigg.worker.record_deferred',
            mechanism: 'delay',
            delaySeconds,
            ...details,
            error,
        });
        return { outcome: 'acked' };
    }

    async _deferWithSchedule({
        record,
        body,
        next,
        error,
        retryAt,
        details,
        state,
    }) {
        const scheduler = this.getSchedulerService();
        if (!scheduler) return null;
        const scheduleName = `frigg-defer-${record.messageId || randomUUID()}`;
        try {
            await scheduler.scheduleOneTime({
                scheduleName,
                scheduleAt: retryAt,
                queueResourceId: record.eventSourceARN,
                payload: next,
            });
        } catch (cause) {
            if (cause?.name !== 'ConflictException')
                return { scheduleError: cause };
        }
        await this._recordWait(body, error, state('WAITING', 'schedule'));
        log.warn('Record deferred', {
            eventName: 'frigg.worker.record_deferred',
            mechanism: 'schedule',
            scheduleName,
            ...details,
            error,
        });
        return { outcome: 'acked' };
    }

    async _deferWithVisibility({
        record,
        queueName,
        body,
        error,
        delivery,
        waitMs,
        details,
        state,
        scheduleError,
    }) {
        const visibilityTimeout = Math.min(
            Math.ceil(waitMs / 1000),
            MAX_VISIBILITY_TIMEOUT_SECONDS
        );
        try {
            const queueUrl = await this._queueUrl(queueName);
            await sqs.send(
                new ChangeMessageVisibilityCommand({
                    QueueUrl: queueUrl,
                    ReceiptHandle: record.receiptHandle,
                    VisibilityTimeout: visibilityTimeout,
                })
            );
        } catch (cause) {
            return { outcome: 'skipped', skipped: 'visibility_failed', cause };
        }
        await this._recordWait(
            body,
            error,
            state(
                delivery.isLastAttempt ? 'EXHAUSTED' : 'WAITING',
                'visibility'
            )
        );
        log.warn('Record visibility extended', {
            eventName: 'frigg.worker.record_visibility_extended',
            mechanism: 'visibility',
            visibilityTimeout,
            ...details,
            ...(scheduleError && { scheduleError: causeOf(scheduleError) }),
            error,
        });
        this._logIfLost(delivery, error, details);
        return { outcome: 'failed' };
    }

    getSchedulerService() {
        if (this._schedulerService !== undefined) return this._schedulerService;
        this._schedulerService = null;
        if (
            process.env.SCHEDULER_ROLE_ARN &&
            process.env.SCHEDULER_PROVIDER !== 'mock'
        ) {
            const {
                createSchedulerService,
                SCHEDULER_PROVIDERS,
            } = require('../infrastructure/scheduler/scheduler-service-factory');
            this._schedulerService = createSchedulerService({
                provider: SCHEDULER_PROVIDERS.EVENTBRIDGE,
            });
        }
        return this._schedulerService;
    }

    recordRateLimitWait() {
        return Promise.resolve();
    }

    clearRateLimitWait() {
        return Promise.resolve();
    }

    _queueUrl(queueName) {
        this._queueUrls ??= new Map();
        if (!this._queueUrls.has(queueName)) {
            const lookup = this.getQueueURL({ QueueName: queueName }).catch(
                (error) => {
                    this._queueUrls.delete(queueName);
                    throw error;
                }
            );
            this._queueUrls.set(queueName, lookup);
        }
        return this._queueUrls.get(queueName);
    }

    async _recordWait(body, error, state) {
        await this._runStateHook('record', () =>
            this.recordRateLimitWait(body, error, state)
        );
    }

    async _clearDeferredState(body, delivery) {
        const redelivered = delivery.receiveCount > 1;
        if (readDeferral(body).deferrals === 0 && !redelivered) return;
        await this._runStateHook('clear', () => this.clearRateLimitWait(body));
    }

    async _runStateHook(operation, hook) {
        try {
            await hook();
        } catch (error) {
            log.warn('Rate-limit run state not written', {
                eventName: 'frigg.worker.rate_limit_state_failed',
                operation,
                error,
            });
        }
    }

    _logIfLost(delivery, error, details) {
        if (!delivery.isLastAttempt) return;
        log.error(
            'Rate-limited record lost: the message goes to the dead-letter queue next',
            {
                eventName: 'frigg.worker.record_lost_rate_limited',
                retryAt: details.retryAt,
                reason: error.reason,
                module: error.module,
                error,
            }
        );
    }

    // returns the message id
    async send(params, delay = 0) {
        this._validateParams(params);

        const queueURL = params.QueueUrl;

        const messageParams = _.omit(params, 'QueueUrl');
        const args = {
            DelaySeconds: delay,
            MessageBody: JSON.stringify(messageParams),
            QueueUrl: queueURL,
        };
        return this.sendAsyncSQSMessage(args);
    }

    async sendAsyncSQSMessage(params) {
        const command = new SendMessageCommand(params);
        const data = await sqs.send(command);
        return data.MessageId;
    }

    // Throw an exception if the params do not validate
    _validateParams(params) {}

    _verifyParamExists(params, param) {
        if (!(param in params)) {
            throw new RequiredPropertyError({
                parent: this,
                key: param,
            });
        }
    }

    // async deleteSQSMessage(id){

    // }
}

module.exports = { Worker };
