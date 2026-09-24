# Webhook Quick Start Guide

Get webhooks working in your Frigg integration in 3 simple steps.

## Step 1: Enable Webhooks

Add `webhooks: true` to your Integration Definition:

```javascript
class MyIntegration extends IntegrationBase {
    static Definition = {
        name: 'my-integration',
        version: '1.0.0',
        modules: {
            myapi: { definition: MyApiDefinition },
        },
        webhooks: true,  // ← Add this line
    };
}
```

## Step 2: Handle Webhook Processing

Override the `onWebhook` handler to process webhooks:

```javascript
class MyIntegration extends IntegrationBase {
    // ... Definition ...

    async onWebhook({ data }) {
        const { body } = data;

        // You have full access to:
        // - this.myapi (your API modules)
        // - this.config (integration config)
        // - Database operations

        if (body.event === 'item.created') {
            await this.myapi.api.createItem(body.data);
        }

        return { processed: true };
    }
}
```

## Step 3: Deploy

Deploy your Frigg app - webhook routes are automatically created:

```bash
POST /api/my-integration-integration/webhooks/:integrationId
```

## That's It!

The default behavior handles:
- ✅ Receiving webhooks (instant 200 OK response)
- ✅ Queuing to SQS
- ✅ Loading your integration with DB and API modules
- ✅ Calling your `onWebhook` handler

## Optional: Custom Signature Verification

Override `onWebhookReceived` for custom signature checks:

```javascript
async onWebhookReceived({ req, res }) {
    // Verify signature
    const signature = req.headers['x-webhook-signature'];
    if (!this.verifySignature(req.body, signature)) {
        return res.status(401).json({ error: 'Invalid signature' });
    }

    // Queue for processing (default behavior)
    await this.queueWebhook({
        integrationId: req.params.integrationId,
        body: req.body,
    });

    res.status(200).json({ received: true });
}
```

## Two Webhook Routes

### With Integration ID (Recommended)
```
POST /api/{name}-integration/webhooks/:integrationId
```
- Full integration loaded in worker
- Access to DB, config, and API modules
- Use `this.myapi`, `this.config`, etc.

### Without Integration ID
```
POST /api/{name}-integration/webhooks
```
- Unhydrated integration
- Useful for system-wide events
- Limited context

## Need Help?

See full documentation: `packages/core/handlers/WEBHOOKS.md`

## Common Patterns

### Slack
```javascript
async onWebhookReceived({ req, res }) {
    if (req.body.type === 'url_verification') {
        return res.json({ challenge: req.body.challenge });
    }
    // ... verify signature, queue ...
}
```

### Stripe
```javascript
async onWebhookReceived({ req, res }) {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const event = stripe.webhooks.constructEvent(
        JSON.stringify(req.body),
        req.headers['stripe-signature'],
        process.env.STRIPE_WEBHOOK_SECRET
    );
    await this.queueWebhook({ body: event });
    res.status(200).json({ received: true });
}
```

### GitHub
```javascript
async onWebhookReceived({ req, res }) {
    const crypto = require('crypto');
    const signature = req.headers['x-hub-signature-256'];
    const hash = crypto
        .createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET)
        .update(JSON.stringify(req.body))
        .digest('hex');
    
    if (`sha256=${hash}` !== signature) {
        return res.status(401).json({ error: 'Invalid signature' });
    }
    
    await this.queueWebhook({ integrationId: req.params.integrationId, body: req.body });
    res.status(200).json({ received: true });
}
```

