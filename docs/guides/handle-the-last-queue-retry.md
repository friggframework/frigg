---
description: Use delivery.isLastAttempt to fail a run cleanly before SQS sends the message to the dead-letter queue.
---

# Handle the last queue retry

SQS gives each message a few tries before it gives up and drops it in the dead-letter queue (DLQ). Since 2.0.1 (#653) your handler knows when it is on that final try, so it can wrap up instead of leaving a run stuck "in progress".

## Which handlers get it

Handlers reached through the integration queue receive `{ data, context, delivery }`. That covers any `this.events` entry dispatched through SQS, including `ON_WEBHOOK` and scheduled jobs. HTTP-dispatched handlers (`{ req, res, next }`) and `this.on` events do not get `delivery`.

## Steps

1. Accept `delivery` in your queue handler.
2. Catch the error you are about to rethrow.
3. If `delivery?.isLastAttempt` is `true`, record the failure (mark the run failed, count the lost records).
4. Rethrow, so core keeps its normal retry and DLQ behaviour.

```javascript
async processBatch({ data, delivery }) {
    try {
        await this.syncPage(data);
    } catch (error) {
        if (delivery?.isLastAttempt) await this.failRun(data.processId, error);
        throw error;
    }
}
```

`failRun` and `syncPage` are your own methods. The optional chaining keeps the handler safe when it is called without `delivery`.

## The delivery object

| Field | Type | Value |
|---|---|---|
| `receiveCount` | `number \| undefined` | SQS `ApproximateReceiveCount` of this delivery |
| `maxReceiveCount` | `number \| undefined` | Receives allowed before SQS moves the message to the DLQ, read from `FRIGG_QUEUE_MAX_RECEIVE_COUNT` |
| `isLastAttempt` | `boolean` | `true` only when both counts are known and `receiveCount >= maxReceiveCount` |

## When isLastAttempt is always false

`isLastAttempt` errs on the side of `false`. It is `false` whenever a count is unknown:

* A local or non-SQS invocation (no `ApproximateReceiveCount`).
* A queue the stack does not own (`ownership.queue: 'external'`). Frigg does not know its redrive policy, so it leaves `FRIGG_QUEUE_MAX_RECEIVE_COUNT` unset.

## Where the number comes from

The default is 3 receives. One constant, `INTEGRATION_QUEUE_MAX_RECEIVE_COUNT` in `@friggframework/core/queues/queue-delivery`, feeds both the queue's `RedrivePolicy.maxReceiveCount` and the `FRIGG_QUEUE_MAX_RECEIVE_COUNT` env var on the `<name>QueueWorker` function. The queue and the runtime cannot drift apart.

`delivery` is information only. Core still rethrows retryable errors and discards halt errors (4xx except 408 and 429) as before.
