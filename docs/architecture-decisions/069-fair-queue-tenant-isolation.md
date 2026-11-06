# ADR-069: Tenant Isolation on Integration Queues with SQS Fair Queues

**Status**: Proposed
**Date**: 2026-11-06
**Deciders**: Daniel Klotz

## Context

Devtools creates one standard SQS queue per integration type (`<Name>Queue`). Every
installation of that integration shares it. `IntegrationBase.queueWebhook` sends each inbound
webhook to that queue, and apps send their own follow-up work there too, such as the next page
of an initial sync. The `<name>QueueWorker` Lambda reads the queue with `batchSize: 1` and a
fixed `reservedConcurrency`.

A standard queue delivers in rough arrival order, with no idea of which installation a message
belongs to. So one installation that sends a large burst delays every other installation of
the same integration:

1. **Bursts come from normal customer actions.** A bulk import, a bulk edit or a bulk delete in
   the third-party system sends one webhook per record. One installation can enqueue tens of
   thousands of messages in an hour.
2. **The burst is often slow to drain.** The work for each message calls a rate-limited API. When
   the target API returns 429, the message fails, waits out the visibility timeout and comes
   back. The burst then holds the queue for hours.
3. **Every other installation waits behind it.** Their webhooks are on time, but they sit
   behind the backlog. In one production case the oldest message reached 90 minutes of age
   within two hours. Every installation of that integration saw a 90-minute sync delay, though
   only one of them was busy.
4. **More concurrency does not fix it.** The burst is limited by the target API, not by Lambda.
   More workers send more requests to an API that already returns 429, and the queue worker
   shares the account's concurrency pool with every other function.

### SQS fair queues

In July 2025 AWS added fair queues to standard SQS queues. No queue attribute is needed. A
producer sets `MessageGroupId` on the message, and SQS treats each group as a tenant:

- SQS marks a tenant as noisy when it holds more than about 10% of the queue's in-flight
  messages and at least 30 of its own, or when its share of recent consumer processing time is
  more than about 10%.
- While a tenant is noisy, consumers get messages from quiet tenants first, whenever quiet
  messages are available. Noisy messages are not dropped or throttled. They are delivered when
  no quiet message is waiting.
- Consumers need no change. This includes a Lambda event source mapping.
- On a standard queue, `MessageGroupId` does not give ordering. The queue keeps its throughput.
- A message without `MessageGroupId` counts as its own tenant. So a queue can hold a mix of
  grouped and ungrouped messages.
- There is no limit on the number of groups.
- New CloudWatch metrics show the effect: `ApproximateNumberOfNoisyGroups`,
  `ApproximateNumberOfMessagesVisibleInQuietGroups` and
  `ApproximateAgeOfOldestMessageInQuietGroups`.

Sources: the SQS Developer Guide pages
[Fair queues](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-fair-queues.html)
and [How fair queues work](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-fair-queues-detailed.html),
and the AWS Compute Blog post
[Building resilient multi-tenant systems with Amazon SQS fair queues](https://aws.amazon.com/blogs/compute/building-resilient-multi-tenant-systems-with-amazon-sqs-fair-queues/).

## Decision

Core tags every message on an integration queue with the installation that owns it, and uses
the integration id as the SQS `MessageGroupId`. The queues stay standard queues. Devtools does
not change.

### 1. `QueuerUtil` takes a message group

`QueuerUtil.send(message, queueUrl, { messageGroupId })` and
`QueuerUtil.batchSend(entries, queueUrl, { messageGroupId })` take an optional third argument.

- When `messageGroupId` is set, `send` adds `MessageGroupId` to the `SendMessageCommand`, and
  `batchSend` adds it to every entry.
- When it is not set, the call sends what it sends today.
- The value is converted with `String()`. An integration id is a number in Postgres and an
  ObjectId in MongoDB.

### 2. `queueWebhook` groups by integration

`IntegrationBase.queueWebhook` passes `messageGroupId: data.integrationId` when the webhook
route has an integration id.

Some webhook routes have no integration id. One example is a global route that resolves the
installation in the worker. For these routes, `queueWebhook` sends no group, so each message
counts as its own tenant. That is the same as today's behaviour. A later change can let such an
integration resolve its group before it enqueues. This ADR does not require it.

### 3. Integration code groups its own follow-up work

Apps that enqueue follow-up work, such as sync pages, pass `{ messageGroupId: this.id }` to
`QueuerUtil.batchSend`. The core docs for `QueuerUtil` say so. An initial sync of a large
account is the same kind of burst as a bulk webhook, so it must not delay other installations.

### 4. Observability

The queue worker already logs the integration id for each message. This ADR adds no logs. The
docs for operators list the fair-queue metrics above, next to the existing
`ApproximateAgeOfOldestMessage`.

## Consequences

### Positive

- One installation's burst no longer delays the other installations of the same integration.
  Their messages are delivered first while the burst drains.
- The change is small: one optional argument in `QueuerUtil` and one call site in
  `IntegrationBase`.
- No infrastructure change, no migration, and no new queues. The change works on the next
  deploy of core.
- No throughput limit. A busy installation still uses all free worker capacity when no other
  installation has work.

### Negative

- **The noisy tenant drains no faster.** Fairness changes delivery order only. A burst that is
  limited by a third-party API still takes as long as before. The 429 retry path is a separate
  problem (see [ADR-049](./049-rate-limit-awareness.md)).
- **Small worker pools may not reach the in-flight threshold.** The queue worker runs with
  `batchSize: 1` and a reserved concurrency of 20 by default. The in-flight test needs at least
  30 messages from one tenant in flight. On these workers SQS must rely on the processing-time
  test. The docs say the thresholds are approximate. This must be checked under load before the
  ADR is accepted (see Verification).
- **A message without a group is a tenant of its own.** Ungrouped messages are never marked
  noisy. A burst from a route without an integration id still delays everyone.

### Neutral

- Standard queues still give no ordering, with or without `MessageGroupId`.
- Visibility timeout, `maxReceiveCount` and the dead-letter queue work as before. The docs do
  not describe any change to them.
- `@aws-sdk/client-sqs` v3 already has `MessageGroupId` on `SendMessage` and
  `SendMessageBatch`, because FIFO queues use it. The AWS docs state no SDK minimum version.

## Verification

Before the status changes to Accepted:

1. Unit tests: `QueuerUtil.send` and `batchSend` set `MessageGroupId` only when it is given, and
   `queueWebhook` passes the integration id.
2. Load test on a dev stage: send a burst of several thousand messages for one integration id,
   and a small steady flow for a second id. Measure how long the second id's messages wait,
   with and without groups. Watch `ApproximateNumberOfNoisyGroups` and
   `ApproximateAgeOfOldestMessageInQuietGroups`. Do the test with the default worker settings
   (`batchSize: 1`, reserved concurrency 20).
3. Check that LocalStack accepts `MessageGroupId` on a standard queue, so that offline
   development keeps working. If it does not, leave the group out when `IS_OFFLINE` is set.

## Alternatives Considered

### Raise the queue worker's concurrency

Rejected. The burst is limited by the target API. More workers send more requests that get
429, and the worker takes concurrency from the account's shared pool.

### One queue per installation

Rejected. This gives full isolation, but it needs a queue and an event source mapping per
installation. These would have to be created and deleted at run time, outside CloudFormation.
The cost grows with the number of installations.

### Overflow queue for busy installations

Core would count messages per installation and send an installation that goes over a limit to
a second queue with its own worker. This gives full isolation and a separate concurrency
budget. It needs a per-installation rate counter, a second queue and worker for each
integration, and a rule for when to move an installation back. Fair queues give most of the
benefit with none of this. Keep this as the next step if the load test shows fair queues are not
enough.

### FIFO queues with a message group per installation

Rejected. FIFO queues give strict order per group, which Frigg does not need, and have lower
throughput. They also need a queue replacement, because a standard queue cannot become a FIFO
queue.

### Back off on 429 inside the worker

This does not isolate tenants, so it does not replace this ADR. It reduces the work that a
noisy tenant wastes, and it belongs to [ADR-049](./049-rate-limit-awareness.md).

## Related

- [ADR-049](./049-rate-limit-awareness.md): rate-limit awareness (proposed, open PR)
- [ADR-055](./055-recurring-triggers.md): recurring triggers enqueue work on the same queues
  (proposed, open PR)
- `packages/core/queues/queuer-util.js`
- `packages/core/integrations/integration-base.js` (`queueWebhook`)
- `packages/devtools/infrastructure/domains/integration/integration-builder.js` (queue and
  queue worker definitions)
