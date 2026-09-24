const INTEGRATION_QUEUE_MAX_RECEIVE_COUNT = 3;
const QUEUE_MAX_RECEIVE_COUNT_ENV = 'FRIGG_QUEUE_MAX_RECEIVE_COUNT';

const toPositiveInteger = (value) => {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : undefined;
};

/**
 * @typedef {Object} QueueDelivery
 * @property {number|undefined} receiveCount SQS ApproximateReceiveCount of this delivery.
 * @property {number|undefined} maxReceiveCount Receives allowed before the queue dead-letters the message.
 * @property {boolean} isLastAttempt True only when both counts are known and receiveCount >= maxReceiveCount.
 */

/**
 * @param {Object} record SQS event record
 * @param {Object} [env=process.env]
 * @returns {QueueDelivery}
 */
const readQueueDelivery = (record, env = process.env) => {
    const receiveCount = toPositiveInteger(
        record?.attributes?.ApproximateReceiveCount
    );
    const maxReceiveCount = toPositiveInteger(env[QUEUE_MAX_RECEIVE_COUNT_ENV]);

    return {
        receiveCount,
        maxReceiveCount,
        isLastAttempt:
            receiveCount !== undefined &&
            maxReceiveCount !== undefined &&
            receiveCount >= maxReceiveCount,
    };
};

module.exports = {
    INTEGRATION_QUEUE_MAX_RECEIVE_COUNT,
    QUEUE_MAX_RECEIVE_COUNT_ENV,
    readQueueDelivery,
};
