/**
 * Post-deploy step (ADR-054 §2, amended): create the app-scope webhook subscriptions the deployed integrations
 * declare (for example HubSpot's, which belong to the developer app).
 *
 * Add-only unless `--prune-subscriptions`. The deploy machine has no database, so bindings whose options depend on
 * installation config are left to the installation lifecycle and to the admin script, and a group that has one is
 * never pruned here. Supported setup: one provider developer app per stage, because the subscriptions are app-wide.
 * A failure is reported and never fails the deploy; the admin script can be run afterwards.
 */
async function reconcileSubscriptionsAfterDeploy(appDefinition, options = {}, { define } = {}) {
    if (options.skipSubscriptions) {
        console.log('\n⏭️  Skipping webhook subscription reconcile (--skip-subscriptions)');
        return null;
    }
    const integrations = appDefinition?.integrations || [];
    let api = define;
    if (!api) {
        try {
            api = require('@friggframework/core/integrations/define');
        } catch {
            return null;   // a core without defineIntegration: nothing declares app-scope subscriptions
        }
    }
    const prune = Boolean(options.pruneSubscriptions);
    try {
        // The provider credentials (developer app id and key) come from the deploy environment or .env.
        try { require('dotenv').config(); } catch { /* dotenv is optional here */ }
        const results = await api.reconcileAppSubscriptions({ integrations, listInstallations: null, prune });
        if (!results.length) return results;
        console.log(`\nWebhook subscriptions (${prune ? 'prune' : 'add-only'}):`);
        for (const r of results) {
            console.log(`   ${r.extension}: ${r.created.length} created, ${r.removed.length} removed, ${r.kept.length} kept`);
            if (!prune && r.remove.length) console.log(`   ${r.remove.length} not needed by any binding (kept; --prune-subscriptions removes them): ${r.remove.join(', ')}`);
            if (r.pruneSkipped) console.log(`   not pruned: ${r.pruneSkipped}`);
        }
        return results;
    } catch (error) {
        console.log(`\n⚠️  Webhook subscription reconcile failed: ${error.message}`);
        console.log('   The deploy succeeded. Run the reconcile-subscriptions admin script to retry.');
        return null;
    }
}

module.exports = { reconcileSubscriptionsAfterDeploy };
