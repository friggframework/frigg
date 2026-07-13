/**
 * frigg ssm push
 *
 * Writes SSM-offloaded environment values (see ADR-027) from the CLI
 * process environment into Parameter Store. Runs automatically before
 * `frigg deploy` so parameters exist before new code cold-starts; also
 * available standalone to rotate values without deploying.
 */

const path = require('path');
const dotenv = require('dotenv');
const {
    getOffloadedKeys,
    resolveParameterPrefix,
    validateOffloadConfig,
} = require('../../infrastructure/domains/parameters/offload-utils');

const TIER_LIMITS = {
    standard: 4096,
    advanced: 8192,
};

const THROTTLE_BACKOFF_MS = [100, 200, 400];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Send a PutParameterCommand, retrying ThrottlingException with short
 * exponential backoff (mirrors sendWithRetry in core/parameters-to-env.js).
 */
async function putParameterWithRetry(client, PutParameterCommand, input) {
    let attempt = 0;
    for (;;) {
        try {
            return await client.send(new PutParameterCommand(input));
        } catch (error) {
            if (
                error.name === 'ThrottlingException' &&
                attempt < THROTTLE_BACKOFF_MS.length
            ) {
                await sleep(THROTTLE_BACKOFF_MS[attempt]);
                attempt += 1;
                continue;
            }
            throw error;
        }
    }
}

/**
 * Resolve the tier for a single offloaded key. An explicit `--tier` CLI
 * option overrides every key; otherwise each key uses its own
 * ssm.parameters[KEY].tier, defaulting to 'standard'.
 */
function resolveKeyTier(appDefinition, key, options = {}) {
    const raw =
        options.tier ||
        appDefinition.ssm?.parameters?.[key]?.tier ||
        'standard';
    const tier = String(raw).toLowerCase();
    if (!TIER_LIMITS[tier]) {
        throw new Error(
            `Unknown parameter tier '${raw}' for ${key}. Use 'standard' or 'advanced'.`
        );
    }
    return tier;
}

/**
 * Build the PutParameter specs for every offloaded key, reading values
 * from process.env. Throws on invalid config, missing values (unless
 * allowEmpty), or values that exceed their own tier limit.
 */
function collectParameterSpecs(appDefinition, stage, options = {}) {
    const { errors: configErrors } = validateOffloadConfig(appDefinition);
    if (configErrors.length > 0) {
        throw new Error(
            `Invalid SSM offload configuration:\n  - ${configErrors.join(
                '\n  - '
            )}`
        );
    }

    const keys = getOffloadedKeys(appDefinition);
    if (keys.length === 0) {
        return { specs: [], skipped: [] };
    }

    const prefix = resolveParameterPrefix(appDefinition, stage);
    const specs = [];
    const skipped = [];
    const missing = [];
    const oversized = [];

    for (const key of keys) {
        const value = process.env[key];

        if (value === undefined || value === '') {
            if (options.allowEmpty) {
                skipped.push(key);
            } else {
                missing.push(key);
            }
            continue;
        }

        const tier = resolveKeyTier(appDefinition, key, options);
        const maxBytes = TIER_LIMITS[tier];
        const bytes = Buffer.byteLength(value, 'utf8');
        if (bytes > maxBytes) {
            oversized.push(
                `${key} (${bytes} bytes > ${tier} tier limit ${maxBytes})`
            );
            continue;
        }

        specs.push({
            key,
            name: `${prefix}/${key}`,
            value,
            type: appDefinition.ssm?.parameters?.[key]?.type || 'String',
            tier,
        });
    }

    if (missing.length > 0) {
        throw new Error(
            `Missing or empty values for offloaded keys: ${missing.join(
                ', '
            )}. Set them in the environment (or .env) before pushing, or pass --allow-empty to skip them.`
        );
    }

    if (oversized.length > 0) {
        throw new Error(
            `Offloaded values exceed their parameter tier limit: ${oversized.join(
                ', '
            )}. Values over ${TIER_LIMITS.standard} bytes need the advanced tier (up to ${TIER_LIMITS.advanced} bytes, billed by AWS): set ssm.parameters.<KEY>.tier: 'advanced' in the app definition, or pass --tier advanced to 'frigg ssm push'.`
        );
    }

    return { specs, skipped };
}

/**
 * Resolve the region parameters are pushed to. An explicit `--region`
 * option wins; otherwise fall back to AWS_REGION and finally to the same
 * default the composed stack uses ('us-east-1'), so pushes and cold-start
 * reads always target the same region.
 */
function resolvePushRegion(options = {}) {
    return options.region || process.env.AWS_REGION || 'us-east-1';
}

/**
 * Push all offloaded parameters for an app definition. Silent no-op when
 * the offload set is empty. Returns { pushed, skipped }.
 */
async function pushOffloadedParameters(appDefinition, stage, options = {}) {
    const { specs, skipped } = collectParameterSpecs(
        appDefinition,
        stage,
        options
    );

    if (specs.length === 0 && skipped.length === 0) {
        return { pushed: [], skipped };
    }

    const {
        SSMClient,
        PutParameterCommand,
        GetParametersCommand,
    } = require('@aws-sdk/client-ssm');
    const client = new SSMClient({
        region: resolvePushRegion(options),
    });

    // --allow-empty only rotates keys that already exist. A skipped key still
    // ships in FRIGG_SSM_OFFLOADED_KEYS, so if its parameter does not exist the
    // runtime fails fast at cold start on every function — a green deploy that
    // bricks the fleet. Verify existence and abort instead.
    if (skipped.length > 0) {
        const prefix = resolveParameterPrefix(appDefinition, stage);
        const names = skipped.map((key) => `${prefix}/${key}`);
        const existing = new Set();
        for (let i = 0; i < names.length; i += 10) {
            const { Parameters = [] } = await client.send(
                new GetParametersCommand({ Names: names.slice(i, i + 10) })
            );
            for (const param of Parameters) {
                existing.add(param.Name);
            }
        }
        const orphaned = skipped.filter(
            (key) => !existing.has(`${prefix}/${key}`)
        );
        if (orphaned.length > 0) {
            throw new Error(
                `--allow-empty skipped ${orphaned.join(
                    ', '
                )}, but no such parameter exists in Parameter Store. --allow-empty ` +
                    `only rotates keys that already have a value; a skipped key with no ` +
                    `parameter stays in FRIGG_SSM_OFFLOADED_KEYS and fails every function ` +
                    `at cold start. Set a value and push without --allow-empty.`
            );
        }
        for (const key of skipped) {
            console.warn(
                `⚠️  Skipping ${key}: no value in the environment; keeping the existing Parameter Store value (--allow-empty)`
            );
        }
    }

    if (specs.length === 0) {
        return { pushed: [], skipped };
    }

    const pushed = [];
    for (const spec of specs) {
        const input = {
            Name: spec.name,
            Value: spec.value,
            Type: spec.type,
            Overwrite: true,
        };
        if (spec.tier === 'advanced') {
            input.Tier = 'Advanced';
        }
        if (spec.type === 'SecureString' && appDefinition.ssm?.kmsKeyArn) {
            input.KeyId = appDefinition.ssm.kmsKeyArn;
        }

        try {
            const result = await putParameterWithRetry(
                client,
                PutParameterCommand,
                input
            );
            pushed.push({ name: spec.name, version: result.Version });
            console.log(
                `   ✅ ${spec.name} (${spec.type}, v${result.Version})`
            );
        } catch (error) {
            const failure = new Error(
                `Failed to push parameter ${spec.name} (${spec.key}): ${error.message}`
            );
            failure.pushed = pushed;
            throw failure;
        }
    }

    return { pushed, skipped };
}

function loadAppDefinition() {
    const appDefPath = path.join(process.cwd(), 'index.js');
    const { Definition } = require(appDefPath);
    return Definition;
}

/**
 * `frigg ssm push` command action.
 */
async function ssmPushCommand(options) {
    dotenv.config();

    let appDefinition;
    try {
        appDefinition = loadAppDefinition();
    } catch (error) {
        console.error(
            `✗ Could not load the app definition from ${process.cwd()}/index.js: ${error.message}`
        );
        process.exit(1);
    }

    const keys = getOffloadedKeys(appDefinition);
    if (keys.length === 0) {
        console.log(
            'No environment variables are marked for SSM offload — nothing to push.'
        );
        return;
    }

    console.log(
        `🔒 Pushing ${keys.length} offloaded parameter(s) for stage '${options.stage}'...`
    );

    try {
        const { pushed } = await pushOffloadedParameters(
            appDefinition,
            options.stage,
            options
        );
        console.log(`✓ Pushed ${pushed.length} parameter(s)`);
    } catch (error) {
        console.error(`✗ ${error.message}`);
        process.exit(1);
    }
}

module.exports = {
    ssmPushCommand,
    pushOffloadedParameters,
    collectParameterSpecs,
    resolvePushRegion,
};
