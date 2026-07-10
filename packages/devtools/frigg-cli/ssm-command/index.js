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

/**
 * Build the PutParameter specs for every offloaded key, reading values
 * from process.env. Throws on invalid config, missing values (unless
 * allowEmpty), or oversized values.
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

    const tier = (options.tier || 'standard').toLowerCase();
    const maxBytes = TIER_LIMITS[tier];
    if (!maxBytes) {
        throw new Error(
            `Unknown parameter tier '${options.tier}'. Use 'standard' or 'advanced'.`
        );
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

        const bytes = Buffer.byteLength(value, 'utf8');
        if (bytes > maxBytes) {
            oversized.push(`${key} (${bytes} bytes)`);
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
        const hint =
            tier === 'standard'
                ? ` Values over ${TIER_LIMITS.standard} bytes need --tier advanced (up to ${TIER_LIMITS.advanced} bytes, billed by AWS).`
                : ` The advanced tier caps values at ${TIER_LIMITS.advanced} bytes.`;
        throw new Error(
            `Offloaded values exceed the ${tier} parameter tier limit: ${oversized.join(
                ', '
            )}.${hint}`
        );
    }

    return { specs, skipped };
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

    for (const key of skipped) {
        console.warn(
            `⚠️  Skipping ${key}: no value in the environment (--allow-empty)`
        );
    }

    if (specs.length === 0) {
        return { pushed: [], skipped };
    }

    const { SSMClient, PutParameterCommand } = require('@aws-sdk/client-ssm');
    const client = new SSMClient({
        region: process.env.AWS_REGION || options.region,
    });

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
            const result = await client.send(new PutParameterCommand(input));
            pushed.push({ name: spec.name, version: result.Version });
            console.log(
                `   ✅ ${spec.name} (${spec.type}, v${result.Version})`
            );
        } catch (error) {
            throw new Error(
                `Failed to push parameter ${spec.name} (${spec.key}): ${error.message}`
            );
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
};
