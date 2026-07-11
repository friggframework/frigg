// Runtime loader that hydrates process.env from SSM Parameter Store. Used to
// offload env vars that would otherwise blow past Lambda's 4KB env limit.
// Real process.env always wins over SSM (a documented local-debugging escape
// hatch); only keys this loader sets are ever refreshed.

const DEFAULT_CACHE_TTL_SECONDS = 300;
const BATCH_SIZE = 10;
const THROTTLE_BACKOFF_MS = [100, 200, 400];
const REFRESH_RETRY_MS = 30_000;

let client = null;
let cacheExpiresAt = null;
let inflight = null;
const ownedKeys = new Set();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const chunk = (items, size) => {
    const batches = [];
    for (let i = 0; i < items.length; i += size) {
        batches.push(items.slice(i, i + size));
    }
    return batches;
};

const getCacheTtlSeconds = () => {
    const raw = process.env.FRIGG_SSM_CACHE_TTL;
    if (raw === undefined || raw === '') {
        return DEFAULT_CACHE_TTL_SECONDS;
    }
    const parsed = Number(raw);
    return Number.isNaN(parsed) ? DEFAULT_CACHE_TTL_SECONDS : parsed;
};

const parseKeys = (raw) =>
    raw
        .split(',')
        .map((key) => key.trim())
        .filter(Boolean);

const sendWithRetry = async (ssmClient, command) => {
    let attempt = 0;
    for (;;) {
        try {
            return await ssmClient.send(command);
        } catch (err) {
            if (
                err.name === 'ThrottlingException' &&
                attempt < THROTTLE_BACKOFF_MS.length
            ) {
                await sleep(THROTTLE_BACKOFF_MS[attempt]);
                attempt += 1;
                continue;
            }
            throw err;
        }
    }
};

/**
 * Fetch offloaded parameters and return a plain { key: value } map. Fetch-only:
 * no process.env mutation, no caching, no ownership tracking. Shared by the
 * runtime loader and the INIT-phase preload (ssm-preload.js). Throws (listing
 * every missing name) if any requested key is absent from SSM.
 */
const fetchOffloadedParameters = async (prefix, keys, { region } = {}) => {
    const { SSMClient, GetParametersCommand } = require('@aws-sdk/client-ssm');
    const ssmClient = new SSMClient({
        region: region || process.env.AWS_REGION,
    });
    const nameFor = (key) => `${prefix}/${key}`;

    const found = new Map();
    for (const batch of chunk(keys, BATCH_SIZE)) {
        const { Parameters = [] } = await sendWithRetry(
            ssmClient,
            new GetParametersCommand({
                Names: batch.map(nameFor),
                WithDecryption: true,
            })
        );
        for (const param of Parameters) {
            found.set(param.Name, param);
        }
    }

    const missing = keys.map(nameFor).filter((name) => !found.has(name));
    if (missing.length > 0) {
        throw new Error(
            `missing SSM parameters under ${prefix}: ${missing.join(', ')}`
        );
    }

    const values = {};
    for (const key of keys) {
        values[key] = found.get(nameFor(key)).Value;
    }
    return values;
};

const loadParameters = async (prefix, keys) => {
    const { SSMClient, GetParametersCommand } = require('@aws-sdk/client-ssm');
    if (!client) {
        client = new SSMClient({ region: process.env.AWS_REGION });
    }

    // A key already living in process.env wins over SSM, except keys we set
    // ourselves — those we refresh so later invocations pick up rotations.
    const keysToFetch = keys.filter(
        (key) => ownedKeys.has(key) || process.env[key] === undefined
    );
    const nameFor = (key) => `${prefix}/${key}`;

    // A refresh means every key already has a served value; a warm container
    // must keep serving stale values through an SSM blip instead of erroring.
    const isRefresh =
        keysToFetch.length > 0 &&
        keysToFetch.every((key) => ownedKeys.has(key));

    const found = new Map();
    try {
        for (const batch of chunk(keysToFetch, BATCH_SIZE)) {
            const { Parameters = [] } = await sendWithRetry(
                client,
                new GetParametersCommand({
                    Names: batch.map(nameFor),
                    WithDecryption: true,
                })
            );
            for (const param of Parameters) {
                found.set(param.Name, param);
            }
        }

        const missing = keysToFetch
            .map(nameFor)
            .filter((name) => !found.has(name));
        if (missing.length > 0) {
            throw new Error(
                `parametersToEnv: missing SSM parameters under ${prefix}: ${missing.join(
                    ', '
                )}`
            );
        }
    } catch (err) {
        if (!isRefresh) {
            throw err;
        }
        console.warn(
            `parametersToEnv: refresh failed, keeping cached values: ${err.message}`
        );
        cacheExpiresAt = Date.now() + REFRESH_RETRY_MS;
        return;
    }

    const loaded = keysToFetch.map((key) => {
        const param = found.get(nameFor(key));
        process.env[key] = param.Value;
        ownedKeys.add(key);
        return `${param.Name} (v${param.Version})`;
    });

    const ttlSeconds = getCacheTtlSeconds();
    cacheExpiresAt =
        ttlSeconds === 0 ? Infinity : Date.now() + ttlSeconds * 1000;

    if (loaded.length > 0) {
        console.log('parametersToEnv: loaded', loaded);
    }
};

/**
 * Hydrate process.env from SSM Parameter Store.
 *
 * No-op unless both SSM_PARAMETER_PREFIX and FRIGG_SSM_OFFLOADED_KEYS are set.
 * Results are cached for FRIGG_SSM_CACHE_TTL seconds (default 300; 0 = forever).
 * A failed fetch is never cached, so the next invocation retries.
 */
const parametersToEnv = async () => {
    const prefix = process.env.SSM_PARAMETER_PREFIX;
    const rawKeys = process.env.FRIGG_SSM_OFFLOADED_KEYS;
    if (!prefix || !rawKeys) {
        return;
    }
    const keys = parseKeys(rawKeys);
    if (keys.length === 0) {
        return;
    }

    if (cacheExpiresAt !== null && Date.now() < cacheExpiresAt) {
        return;
    }

    if (!inflight) {
        inflight = loadParameters(prefix, keys).finally(() => {
            inflight = null;
        });
    }
    return inflight;
};

/**
 * Adopt keys the INIT preload (ssm-preload.mjs) already populated into
 * process.env, so the handler-time loader treats them as its own: it seeds
 * the cache TTL and marks the keys owned so the TTL-refresh path re-fetches
 * them. The preload runs in-process (NODE_OPTIONS=--import), sharing this
 * module singleton. Pass ONLY the keys the preload actually set (not keys
 * already present as real env vars) so the real-env-wins rule is preserved.
 */
const adoptPreloadedKeys = (keys) => {
    for (const key of keys) {
        ownedKeys.add(key);
    }
    const ttlSeconds = getCacheTtlSeconds();
    cacheExpiresAt =
        ttlSeconds === 0 ? Infinity : Date.now() + ttlSeconds * 1000;
};

const _resetCache = () => {
    client = null;
    cacheExpiresAt = null;
    inflight = null;
    ownedKeys.clear();
};

module.exports = {
    parametersToEnv,
    fetchOffloadedParameters,
    adoptPreloadedKeys,
    _resetCache,
};
