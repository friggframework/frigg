/**
 * One-file integrations (ADR-054, the stable event-driven path): `defineIntegration`, `defineApp`, `use`, and the
 * contract-2 extension helper. See DESIGN.md in this folder for how it shares the ADR-063 runtime.
 */
const { defineIntegration, planOf } = require('./define-integration');
const { defineApp } = require('./define-app');
const { use } = require('./use');
const { defineExtension, validateExtension, isContract2 } = require('./define-extension');
const { reconcileAppSubscriptions, ensureInstallationSubscriptions, createReconcileSubscriptionsScript } = require('./subscriptions');

module.exports = { defineIntegration, defineApp, use, defineExtension, validateExtension, isContract2, reconcileAppSubscriptions, ensureInstallationSubscriptions, createReconcileSubscriptionsScript, planOf };
