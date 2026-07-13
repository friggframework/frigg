# Global Entities Guide

This guide explains when and how to use Global Entities in Frigg.

## What Are Global Entities?

**Global Entities** are app-owner-level service accounts that are shared across all users. Unlike regular entities (where each user connects their own account), global entities are configured once by the admin and used by all integrations.

```
Regular Entity (User-Owned)          Global Entity (App-Owner-Owned)
┌─────────────────────────┐          ┌─────────────────────────────────┐
│ User A's HubSpot        │          │ Company's Twilio Account        │
│ - userId: user-a-id     │          │ - isGlobal: true               │
│ - credentials: User A   │          │ - userId: null                 │
│ - Only User A can use   │          │ - credentials: Company's       │
└─────────────────────────┘          │ - ALL users share this         │
                                      └─────────────────────────────────┘
```

## When to Use Global Entities

### ✅ Use Global Entities When:

1. **Your company pays for the service** (not the end user)
   - Company Twilio account for SMS
   - Company OpenAI key for AI features
   - Company Stripe account for billing

2. **The service is a "feature", not an "integration"**
   - "Send SMS notification" = feature (global Twilio)
   - "Sync my CRM contacts" = integration (user's CRM)

3. **Users shouldn't see/manage the credentials**
   - Internal services
   - Backend automations
   - Admin-only configurations

4. **You want consistent behavior across all users**
   - Same SMS sender ID
   - Same AI model version
   - Same webhook endpoint

### ❌ Don't Use Global Entities When:

1. **Each user needs their own account**
   - User's HubSpot CRM
   - User's Slack workspace
   - User's Google Drive

2. **User data stays in user's system**
   - CRM contacts
   - Email accounts
   - Cloud storage

3. **Users need to authorize access**
   - OAuth flows for user accounts
   - Per-user API keys

## The Three Frigg Adoption Patterns

### Pattern 1: User Integrations

**Use Case**: Traditional SaaS integration platform

```javascript
// Example: CRM Sync Integration
// Both entities are user-owned - each user connects their own accounts

static Definition = {
    name: 'crm-sync',
    modules: {
        hubspot: { definition: HubSpotApi },
        salesforce: { definition: SalesforceApi }
    },
    entities: {
        hubspotAccount: {
            type: 'hubspot-api',
            global: false,        // User connects their HubSpot
            required: true
        },
        salesforceAccount: {
            type: 'salesforce-api',
            global: false,        // User connects their Salesforce
            required: true
        }
    }
};
```

**Entity Ownership**:
- All entities owned by users
- Users manage their own credentials
- Standard OAuth flow per user

### Pattern 2: Feature-Powered Integrations

**Use Case**: Product features backed by global services

```javascript
// Example: SMS Notification Feature
// Platform entity is user-owned, SMS entity is global

static Definition = {
    name: 'sms-notifications',
    modules: {
        platform: { definition: YourPlatformApi },
        sms: { definition: TwilioApi }
    },
    entities: {
        userPlatform: {
            type: 'platform-api',
            global: false,        // User connects their platform account
            required: true
        },
        sharedSms: {
            type: 'twilio-api',
            global: true,         // Company's Twilio (admin configures once)
            required: true        // Feature won't work without it
        }
    }
};
```

**Entity Ownership**:
- Platform entity: user-owned
- SMS entity: global (admin configures at deploy)

**User Experience**:
1. User enables "SMS notifications" feature
2. Framework auto-includes company's Twilio entity
3. User never sees Twilio credentials
4. SMS sent from company's Twilio account

### Pattern 3: Internal Automation

**Use Case**: Back-office automation, sales workflows

```javascript
// Example: Support Ticket on Integration Error
// All entities are global - internal company accounts

static Definition = {
    name: 'error-to-ticket',
    modules: {
        platform: { definition: YourPlatformAdminApi },
        support: { definition: ZendeskApi }
    },
    entities: {
        platformAdmin: {
            type: 'platform-admin-api',
            global: true,         // Company's admin API
            required: true
        },
        supportDesk: {
            type: 'zendesk-api',
            global: true,         // Company's Zendesk
            required: true
        }
    }
};
```

**Entity Ownership**:
- All entities are global
- "Users" are internal team members or org units
- Automations run on company systems

## Configuring Global Entities

### Step 1: Mark Entity as Global in Integration Definition

```javascript
entities: {
    sharedService: {
        type: 'service-api',      // Must match entity.type in database
        global: true,              // Framework will auto-include this
        required: true             // true = fail if not found
                                   // false = optional, graceful degradation
    }
}
```

### Step 2: Admin Creates Global Entity

**Option A: Via Admin API**
```bash
curl -X POST https://your-frigg-app/api/admin/entities \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "twilio-api",
    "name": "Company Twilio",
    "credentials": {
      "account_sid": "AC...",
      "auth_token": "..."
    }
  }'
```

**Option B: Via Management UI** (after implementation)
1. Go to Admin → Global Entities
2. Click "Create Global Entity"
3. Select entity type
4. Complete OAuth flow or enter credentials
5. Entity is now available for all integrations

### Step 3: Integration Auto-Includes Global Entity

When a user creates an integration:
1. Framework checks `Definition.entities` for `global: true`
2. Queries database for matching global entity
3. Auto-adds to integration's entity list
4. User never sees the global entity in their view

## Database Requirements

Global entities need the `isGlobal` field in the Entity table:

```prisma
model Entity {
  id           String   @id
  userId       String?  // null for global entities
  moduleName   String?  // Already exists - used for entity lookup (e.g., 'twilio-api')
  isGlobal     Boolean  @default(false)  // NEW: marks entity as global
  credentialId String?  // References Credential with authIsValid for status
  // ... other fields
}
```

**Note**: Entity connection status is determined by `credential.authIsValid`, not a separate status field.

## Testing Global Entities

### In Development

1. Create global entity via API or seed script
2. Verify entity has `isGlobal: true`
3. Create integration that uses global entity
4. Verify auto-inclusion worked

### In Management UI Test Zone

1. Start Frigg app
2. Go to Admin → Global Entities
3. Create test global entity
4. Switch to User View
5. Create integration using that type
6. Verify global entity was auto-included

## Best Practices

1. **Name global entities clearly**
   - "Company Twilio - Production"
   - "OpenAI - GPT-4 Key"

2. **Use `required: false` for optional features**
   - Integration works without it
   - Feature gracefully degrades

3. **Rotate credentials via entity updates**
   - Don't delete and recreate
   - Update credentials in place

4. **Monitor global entity usage**
   - Track which integrations use each global entity
   - Monitor API usage/costs

5. **Document for your team**
   - Which global entities exist
   - What they're used for
   - Who manages the credentials

## Current Limitations

> **Note**: As of this writing, the global entity feature requires a schema migration to add the `isGlobal` field to the Entity model. See [ADR-024: Global Entities](../architecture-decisions/024-global-entities.md) for details.

**Key Implementation Details:**
- `moduleName` is used for entity lookups (already exists in schema)
- Entity connection status is determined by `credential.authIsValid` (no separate status field needed)
- Only the `isGlobal` boolean field needs to be added to the schema

After the migration:
- Global entity queries will work (`findEntitiesBy({ isGlobal: true, moduleName: 'x' })`)
- Auto-inclusion will function based on `moduleName` matching
- Management UI can create and manage global entities via the standard auth flow
