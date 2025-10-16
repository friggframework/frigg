# Webhook Handling in Frigg

This document explains how to implement webhook handling for your Frigg integrations using the built-in webhook infrastructure.

## Overview

Frigg provides a scalable webhook architecture that:
- **Receives webhooks without database connections** for fast response times
- **Queues webhooks to SQS** for async processing
- **Processes webhooks with fully hydrated integrations** (with DB and API modules loaded)
- **Supports custom signature verification** for security
- **Throttles database connections** using SQS to handle webhook bursts

## Architecture

The webhook flow consists of two stages:

### Stage 1: HTTP Webhook Receiver (No DB)
```
Webhook → Lambda → WEBHOOK_RECEIVED event → Queue to SQS → 200 OK Response
```
- Fast response (no database query)
- Optional signature verification
- Messages queued for processing

### Stage 2: Queue Worker (DB-Connected)
```
SQS Queue → Lambda Worker → ON_WEBHOOK event → Process with hydrated integration
```
- Full database access
- API modules loaded
- Can use integration context

## Enabling Webhooks

### Simple Configuration

Add `webhooks: true` to your Integration Definition:

```javascript
class MyIntegration extends IntegrationBase {
    static Definition = {
        name: 'my-integration',
        version: '1.0.0',
        modules: {
            myapi: { definition: MyApiDefinition },
        },
        webhooks: true, // Enable webhook handling
    };
}
```

### Advanced Configuration

For future extensibility, you can use object configuration:

```javascript
class MyIntegration extends IntegrationBase {
    static Definition = {
        name: 'my-integration',
        version: '1.0.0',
        modules: { /* ... */ },
        webhooks: {
            enabled: true,
            // Future options will be added here
        },
    };
}
```

## Webhook Routes

When webhooks are enabled, two routes are automatically created:

### General Webhook
```
POST /api/{integrationName}-integration/webhooks
```
- No integration ID required
- Useful for system-wide events
- Creates unhydrated integration instance

### Integration-Specific Webhook
```
POST /api/{integrationName}-integration/webhooks/:integrationId
```
- Includes integration ID in URL
- Worker loads full integration with DB and modules
- Recommended for most use cases

## Event Handlers

### WEBHOOK_RECEIVED Event

Triggered when a webhook HTTP request is received (no database connection).

#### Default Behavior
Queues the webhook to SQS and responds with `200 OK`:

```javascript
// Default handler (automatic)
async onWebhookReceived({ req, res }) {
    await this.queueWebhook({
        integrationId: req.params.integrationId || null,
        body: req.body,
        headers: req.headers,
        query: req.query,
    });
    res.status(200).json({ received: true });
}
```

#### Custom Signature Verification

Override `onWebhookReceived` for custom signature verification:

```javascript
class MyIntegration extends IntegrationBase {
    static Definition = {
        name: 'my-integration',
        webhooks: true,
    };

    async onWebhookReceived({ req, res }) {
        // Verify webhook signature
        const signature = req.headers['x-webhook-signature'];
        const expectedSignature = this.calculateSignature(req.body);
        
        if (signature !== expectedSignature) {
            return res.status(401).json({ error: 'Invalid signature' });
        }

        // Queue for processing
        await this.queueWebhook({
            integrationId: req.params.integrationId,
            body: req.body,
            headers: req.headers,
        });

        res.status(200).json({ received: true, verified: true });
    }

    calculateSignature(body) {
        const crypto = require('crypto');
        const secret = process.env.MY_WEBHOOK_SECRET;
        return crypto
            .createHmac('sha256', secret)
            .update(JSON.stringify(body))
            .digest('hex');
    }
}
```

### ON_WEBHOOK Event

Triggered by the queue worker (with database connection and hydrated integration).

#### Default Behavior
Logs the webhook data (override this!):

```javascript
// Default handler (logs only)
async onWebhook({ data }) {
    console.log('Webhook received:', data);
}
```

#### Custom Processing

Override `onWebhook` to process webhooks with full integration context:

```javascript
class MyIntegration extends IntegrationBase {
    static Definition = {
        name: 'my-integration',
        modules: {
            myapi: { definition: MyApiDefinition },
        },
        webhooks: true,
    };

    async onWebhook({ data }) {
        const { body, headers, integrationId } = data;

        // Access hydrated API modules
        if (body.event === 'item.created') {
            await this.myapi.api.createRecord({
                externalId: body.data.id,
                name: body.data.name,
            });
        }

        // Access integration config
        const syncEnabled = this.config.syncEnabled;
        if (syncEnabled) {
            await this.performSync(body.data);
        }

        // Update integration mappings
        await this.upsertMapping(body.data.id, {
            externalId: body.data.id,
            syncedAt: new Date(),
        });

        return { processed: true };
    }

    async performSync(data) {
        // Custom sync logic
    }
}
```

## Examples

### Example 1: Slack Message Events

```javascript
class SlackIntegration extends IntegrationBase {
    static Definition = {
        name: 'slack',
        modules: {
            slack: { definition: SlackApiDefinition },
        },
        webhooks: true,
    };

    async onWebhookReceived({ req, res }) {
        // Slack URL verification challenge
        if (req.body.type === 'url_verification') {
            return res.json({ challenge: req.body.challenge });
        }

        // Verify Slack signature
        const slackSignature = req.headers['x-slack-signature'];
        if (!this.verifySlackSignature(req, slackSignature)) {
            return res.status(401).json({ error: 'Invalid signature' });
        }

        await this.queueWebhook({
            integrationId: req.params.integrationId,
            body: req.body,
        });

        res.status(200).json({ ok: true });
    }

    async onWebhook({ data }) {
        const { body } = data;

        if (body.event.type === 'message') {
            // Process message with API access
            await this.slack.api.postMessage({
                channel: body.event.channel,
                text: `Received: ${body.event.text}`,
            });
        }
    }

    verifySlackSignature(req, signature) {
        // Slack signature verification logic
        const crypto = require('crypto');
        const signingSecret = process.env.SLACK_SIGNING_SECRET;
        const timestamp = req.headers['x-slack-request-timestamp'];
        
        // Validate timestamp is recent (within 5 minutes)
        const currentTime = Math.floor(Date.now() / 1000);
        if (Math.abs(currentTime - parseInt(timestamp)) > 300) {
            return false; // Request is older than 5 minutes
        }
        
        const hmac = crypto.createHmac('sha256', signingSecret);
        hmac.update(`v0:${timestamp}:${JSON.stringify(req.body)}`);
        const expected = `v0=${hmac.digest('hex')}`;
        
        // Check lengths first to avoid errors in timingSafeEqual
        const expectedBuffer = Buffer.from(expected)
        const signatureBuffer = Buffer.from(signature)
        
        if (expectedBuffer.length !== signatureBuffer.length) {
            return false
        }
        
        return crypto.timingSafeEqual(expectedBuffer, signatureBuffer)

    }
}
```

### Example 2: Stripe Webhook Events

```javascript
class StripeIntegration extends IntegrationBase {
    static Definition = {
        name: 'stripe',
        modules: {
            stripe: { definition: StripeApiDefinition },
        },
        webhooks: true,
    };

    async onWebhookReceived({ req, res }) {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        const sig = req.headers['stripe-signature'];

        try {
            // Stripe signature verification
            const event = stripe.webhooks.constructEvent(
                JSON.stringify(req.body),
                sig,
                process.env.STRIPE_WEBHOOK_SECRET
            );

            await this.queueWebhook({
                integrationId: req.params.integrationId,
                body: event,
            });

            res.status(200).json({ received: true });
        } catch (err) {
            res.status(400).json({ error: `Webhook Error: ${err.message}` });
        }
    }

    async onWebhook({ data }) {
        const event = data.body;

        switch (event.type) {
            case 'payment_intent.succeeded':
                await this.handlePaymentSuccess(event.data.object);
                break;
            case 'customer.subscription.created':
                await this.handleSubscriptionCreated(event.data.object);
                break;
            default:
                console.log(`Unhandled event type: ${event.type}`);
        }
    }

    async handlePaymentSuccess(paymentIntent) {
        // Update your database, send notifications, etc.
        await this.stripe.api.updatePaymentRecord(paymentIntent.id, {
            status: 'succeeded',
            amount: paymentIntent.amount,
        });
    }

    async handleSubscriptionCreated(subscription) {
        // Process new subscription
        await this.upsertMapping(subscription.id, {
            stripeSubscriptionId: subscription.id,
            status: subscription.status,
            createdAt: new Date(subscription.created * 1000),
        });
    }
}
```

### Example 3: General Webhook (No Integration ID)

```javascript
class SystemWebhookIntegration extends IntegrationBase {
    static Definition = {
        name: 'system-webhook',
        webhooks: true,
    };

    async onWebhook({ data }) {
        const { body } = data;

        // Process system-wide webhook without integration context
        console.log('System webhook received:', body);

        // Could trigger actions across multiple integrations
        // or perform system-level operations
    }
}
```

## Environment Variables

Webhook functionality requires queue URL environment variables:

```bash
# Format: {INTEGRATION_NAME}_QUEUE_URL
SLACK_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789/slack-queue
STRIPE_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789/stripe-queue
```

These are automatically configured by the Frigg infrastructure when using the serverless template.

## Testing Webhooks

### Unit Test Example

```javascript
describe('MyIntegration Webhooks', () => {
    it('should verify webhook signature', async () => {
        const integration = new MyIntegration();
        const dispatcher = new IntegrationEventDispatcher(integration);

        const req = {
            body: { event: 'test' },
            params: {},
            headers: { 'x-webhook-signature': 'valid-sig' },
            query: {},
        };
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };

        await dispatcher.dispatchHttp({
            event: 'WEBHOOK_RECEIVED',
            req,
            res,
            next: jest.fn(),
        });

        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should process webhook with hydrated instance', async () => {
        const integration = new MyIntegration({
            id: 'int-123',
            userId: 'user-456',
            modules: [],
        });
        const dispatcher = new IntegrationEventDispatcher(integration);

        const result = await dispatcher.dispatchJob({
            event: 'ON_WEBHOOK',
            data: {
                integrationId: 'int-123',
                body: { event: 'item.created' },
            },
            context: {},
        });

        expect(result.processed).toBe(true);
    });
});
```

## Best Practices

### 1. Always Verify Signatures
```javascript
async onWebhookReceived({ req, res }) {
    // Verify before queueing
    if (!this.verifySignature(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    await this.queueWebhook({ /* ... */ });
    res.status(200).json({ received: true });
}
```

### 2. Respond Quickly
The `WEBHOOK_RECEIVED` handler should complete in < 3 seconds:
- Verify signature
- Queue message
- Return 200 OK

Heavy processing goes in `ON_WEBHOOK`.

### 3. Handle Idempotency
```javascript
async onWebhook({ data }) {
    const { body } = data;
    const eventId = body.id;

    // Check if already processed
    const existing = await this.getMapping(eventId);
    if (existing) {
        console.log(`Event ${eventId} already processed`);
        return { processed: false, duplicate: true };
    }

    // Process and mark as complete
    await this.processEvent(body);
    await this.upsertMapping(eventId, { processedAt: new Date() });
}
```

### 4. Error Handling
```javascript
async onWebhook({ data }) {
    try {
        await this.processWebhookData(data.body);
    } catch (error) {
        // Log error - message will go to DLQ after retries
        console.error('Webhook processing failed:', error);
        
        // Update integration status if needed
        await this.updateIntegrationMessages.execute(
            this.id,
            'errors',
            'Webhook Processing Error',
            error.message,
            Date.now()
        );
        
        throw error; // Re-throw for retry/DLQ
    }
}
```

## Infrastructure

### Automatic Configuration

When `webhooks: true` is set, the Frigg infrastructure automatically creates:

1. **HTTP Lambda Function**
   - Handler: `integration-webhook-routers.js`
   - No database connection
   - Fast cold start

2. **Webhook Routes**
   - `POST /api/{name}-integration/webhooks`
   - `POST /api/{name}-integration/webhooks/:integrationId`

3. **Queue Worker**  
   - Processes from existing integration queue
   - Handles `ON_WEBHOOK` events
   - Full database access

### Serverless Configuration (Automatic)

The following is generated automatically in `serverless.yml`:

```yaml
functions:
  myintegrationWebhook:
    handler: node_modules/@friggframework/core/handlers/routers/integration-webhook-routers.handlers.myintegrationWebhook.handler
    events:
      - httpApi:
          path: /api/myintegration-integration/webhooks
          method: POST
      - httpApi:
          path: /api/myintegration-integration/webhooks/{integrationId}
          method: POST

  myintegrationQueueWorker:
    handler: node_modules/@friggframework/core/handlers/workers/integration-defined-workers.handlers.myintegration.queueWorker
    events:
      - sqs:
          arn: !GetAtt MyintegrationQueue.Arn
          batchSize: 1
```

## Event Handler Reference

### onWebhookReceived({ req, res })

**Called:** When webhook HTTP request is received  
**Context:** Unhydrated integration (no DB, no modules loaded)  
**Purpose:** Signature verification, quick response  
**Must:** Respond to `res` with status code

**Parameters:**
- `req` - Express request object
  - `req.body` - Webhook payload
  - `req.params.integrationId` - Integration ID (if in URL)
  - `req.headers` - HTTP headers
  - `req.query` - Query parameters
- `res` - Express response object
  - Call `res.status(code).json(data)` to respond

### onWebhook({ data, context })

**Called:** When queue worker processes the webhook  
**Context:** Hydrated integration (DB connected, modules loaded)  
**Purpose:** Process webhook with full integration context  
**Can:** Use `this.modules`, `this.config`, DB operations

**Parameters:**
- `data` - Queued webhook data
  - `data.integrationId` - Integration ID (if provided)
  - `data.body` - Original webhook payload
  - `data.headers` - Original HTTP headers
  - `data.query` - Original query parameters
- `context` - Lambda context object

## Queue Helper

### queueWebhook(data)

Utility method to queue webhook for processing:

```javascript
await this.queueWebhook({
    integrationId: 'int-123', // optional
    body: webhookPayload,
    headers: requestHeaders,
    query: queryParams,
    customField: 'any additional data',
});
```

Automatically uses the correct SQS queue URL based on integration name.

## Troubleshooting

### Queue URL Not Found

**Error:** `Queue URL not found for {NAME}_QUEUE_URL`

**Solution:** Ensure environment variable is set:
```bash
export MY_INTEGRATION_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/...
```

### Webhook Not Responding

**Check:**
1. Is `webhooks: true` in Definition?
2. Is webhook endpoint deployed?
3. Are you sending POST requests?
4. Check CloudWatch logs for errors

### Worker Not Processing

**Check:**
1. Is SQS queue receiving messages?
2. Is queue worker Lambda function deployed?
3. Check CloudWatch logs for worker errors
4. Verify integration can be loaded from DB (for ID-specific webhooks)

## Security Considerations

1. **Always verify signatures** in production
2. **Use HTTPS** for webhook endpoints
3. **Validate webhook payloads** before processing
4. **Rate limit** at API Gateway level if needed
5. **Monitor** failed webhook processing in DLQ

## Performance

- **HTTP Response:** < 100ms (signature check + queue)
- **Worker Processing:** Based on your logic
- **Concurrency:** Controlled by SQS worker `reservedConcurrency: 5`
- **Burst Handling:** Unlimited HTTP, throttled processing

## Related Files

- `packages/core/integrations/integration-base.js` - Event definitions and default handlers
- `packages/core/handlers/routers/integration-webhook-routers.js` - HTTP webhook routes
- `packages/core/handlers/backend-utils.js` - Queue worker with hydration logic
- `packages/core/handlers/integration-event-dispatcher.js` - Event dispatching
- `packages/devtools/infrastructure/serverless-template.js` - Automatic infrastructure generation

