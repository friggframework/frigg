// =====================================================================================
// (a) ONE-WAY, EVENT-DRIVEN: a HubSpot deal enters a chosen stage -> post to Slack.
// This is the WHOLE app: backend/index.js. Target DX for 2.0.1 (see ADR-054).
// App code: ~70 lines. Nothing else in the repo but package.json and infrastructure.js.
// =====================================================================================
const { defineApp, defineIntegration, use } = require('@friggframework/core');
const hubspot = require('@friggframework/api-module-hubspot');
const slack = require('@friggframework/api-module-slack');

const DealAlerts = defineIntegration({
    name: 'deal-alerts',
    version: '1.0.0',
    display: {
        label: 'Deal alerts in Slack',
        description: 'Posts to a Slack channel when a HubSpot deal reaches a chosen stage.',
        category: 'Notifications',
    },

    // The module key (crm, chat) is the namespace for everything a module's extensions
    // contribute: routes (/api/deal-alerts-integration/crm-webhooks/...), events
    // ('crm.deal.changed'), config fields, and admin scripts.
    modules: {
        crm: use(hubspot, {
            webhooks: {
                subscribe: ['deal.creation', 'deal.propertyChange:dealstage'],
                hydrate: ['dealname', 'amount', 'dealstage', 'pipeline', 'hubspot_owner_id'],
            },
        }),
        chat: use(slack),
    },

    // Per-install form shown to the end user. Module fields load their options from
    // the connected account (Slack channels, HubSpot pipelines and stages).
    config: {
        channel: slack.fields.channel({ title: 'Post to channel', required: true }),
        stages: hubspot.fields.dealStages({
            title: 'Alert when a deal enters',
            multiple: true,
            default: ['closedwon'],
        }),
        minAmount: { type: 'number', title: 'Only deals worth at least', default: 0 },
        mentionOwner: { type: 'boolean', title: 'Mention the deal owner', default: true },
    },

    // Handlers take (payload, ctx). ctx.modules holds the APIs under the keys chosen
    // above (crm, chat); every other ctx key is core's and fixed.
    on: {
        // Emitted by hubspot.extensions.webhooks after it verified the v3 signature,
        // resolved portalId -> this integration, and batch-read the deal (hydrate).
        async 'crm.deal.changed'({ deal, changes }, { modules: { crm, chat }, config, log }) {
            const stage = changes.dealstage?.to ?? deal.properties.dealstage;
            if (!config.stages.includes(stage)) return;
            if (Number(deal.properties.amount ?? 0) < config.minAmount) return;

            let mention = '';
            if (config.mentionOwner && deal.properties.hubspot_owner_id) {
                const owner = await crm.getOwnerById(deal.properties.hubspot_owner_id);
                const user = owner?.email && (await chat.lookupUserByEmail(owner.email).catch(() => null));
                if (user?.user?.id) mention = ` <@${user.user.id}>`;
            }

            await chat.postMessage({
                channel: config.channel,
                text: `Deal *${deal.properties.dealname}* moved to ${stage}${mention}`,
                blocks: [
                    { type: 'section', text: { type: 'mrkdwn',
                        text: `*${deal.properties.dealname}*  ${stage}\nAmount: ${deal.properties.amount ?? 'n/a'}${mention}` } },
                    { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open in HubSpot' },
                        url: crm.urls.record('deal', deal.id) }] },
                ],
            });
            log.info({ dealId: deal.id, stage }, 'deal alert posted');
        },
    },

    actions: {
        SEND_TEST_ALERT: {
            title: 'Send a test message',
            async run(_input, { modules: { chat }, config }) {
                await chat.postMessage({ channel: config.channel, text: 'Deal alerts are connected.' });
                return { ok: true };
            },
        },
    },
});

module.exports = defineApp({
    name: 'deal-alerts',
    integrations: [DealAlerts],
    database: { postgres: { enable: true } },
    encryption: { fieldLevelEncryptionMethod: 'kms' },
});

// =====================================================================================
// WHAT EACH IMPORT CONTRIBUTES (none of it is written in this file)
//
// @friggframework/core
//   defineIntegration -> an IntegrationBase subclass with a static Definition, so every
//     existing builder, router, worker and the management API work unchanged.
//   on/actions -> this.events (LIFE_CYCLE_EVENT / USER_ACTION), handler(payload, ctx),
//     ctx = { modules: { crm, chat }, config, log, telemetry, commands, integration }.
//     No `this`. The keys inside ctx.modules are this file's; the rest are core's.
//   config -> getConfigOptions() jsonSchema/uiSchema + validateConfig() (NEEDS_CONFIG).
//   Queue worker, DLQ, retries, delivery.isLastAttempt, structured logs, telemetry,
//   usage counters, encryption, token refresh: already on next.
//
// @friggframework/api-module-hubspot
//   Definition: OAuth2, scopes, entity identity (portalId = externalId).
//   Api: getOwnerById, batch reads, urls.record(); static rateLimit (ADR-049, descriptive).
//   fields.dealStages: config field with options loaded from the connected portal.
//   extensions.webhooks (contract 2):
//     route POST /webhooks, useDatabase: false, verify: HubSpot v3 HMAC + 5 min skew
//     resolve: portalId -> integration (the RESOLVE hop the extension does by hand today)
//     subscriptions: scope 'app' (HubSpot v3 subscriptions are per developer app);
//       desired set = union of every installed binding's `subscribe`; reconciled by the
//       framework on deploy and by a daily trigger; teardown when no binding needs it.
//     emits: deal.created | deal.changed {deal, changes} | deal.deleted (+ contact.*, company.*)
//     hydrate: batch-reads the object with the listed properties before dispatch.
//     env: HUBSPOT_CLIENT_SECRET, HUBSPOT_APP_ID, HUBSPOT_DEVELOPER_API_KEY (ADR-027 scoping).
//     scripts: hubspot.reconcile-subscriptions, hubspot.replay-webhook (admin scripts).
//
// @friggframework/api-module-slack
//   Definition: OAuth2 bot install, team_id = externalId.
//   Api: postMessage, lookupUserByEmail; static rateLimit (tiered, per-method).
//   fields.channel: config field with options from conversations.list.
//   (extensions.events — Slack Events API receiver with url_verification handshake — is
//    available but not enabled here, so no route is deployed for it.)
//
// Provisioned by devtools from the Definition (no infrastructure code in the app):
//   deal-alerts (HTTP catch-all), deal-alerts__crmwebhooks (receiver, no Prisma layer),
//   deal-alerts QueueWorker + queue + DLQ, the daily frigg.subscriptions.reconcile trigger (ADR-055), and the
//   admin-script functions for the module-shipped scripts.
// =====================================================================================
