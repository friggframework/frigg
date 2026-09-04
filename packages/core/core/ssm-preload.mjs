// INIT-phase SSM loader (ADR-027).
//
// Loaded via NODE_OPTIONS=--import BEFORE the Lambda handler and any api-module
// is required, so SSM-offloaded values are present in process.env at
// module-load time — when api-modules capture their OAuth client credentials
// in a top-level `const Definition = { env: { client_secret: process.env.X } }`.
// The runtime loader (parameters-to-env.js) runs inside the handler, which is
// too late for those module-load reads; this preload closes that gap.
//
// Top-level await here is awaited by Node before the entry module loads, so the
// fetch completes first. A fetch failure rejects the preload, failing Lambda
// INIT loudly (fail-fast) rather than starting with undefined credentials.

import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const prefix = process.env.SSM_PARAMETER_PREFIX;
const rawKeys = process.env.FRIGG_SSM_OFFLOADED_KEYS;

if (prefix && rawKeys) {
    const keys = rawKeys
        .split(',')
        .map((key) => key.trim())
        .filter(Boolean);

    if (keys.length > 0) {
        // The fetch/real-env-wins/adopt logic lives in the CJS module (tested
        // there); this preload is a thin INIT-phase shim over it.
        const { preloadOffloadedParameters } = require('./parameters-to-env');
        const setKeys = await preloadOffloadedParameters(prefix, keys);
        console.log(`frigg-ssm-preload: loaded ${setKeys.length} parameter(s) at INIT under ${prefix}`);
    }
}
