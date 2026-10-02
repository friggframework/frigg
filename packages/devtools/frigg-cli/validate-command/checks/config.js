/**
 * Semantic checks of the app definition: rules JSON Schema cannot express,
 * each tied to what a builder or core does with the value (ADR-051).
 *
 * Every check receives the definition with the schema defaults applied
 * (`definition`) and the definition as written (`raw`), so it can tell a
 * value the app set from a default.
 */

const { getSchema } = require('@friggframework/schemas');

const ENCRYPTION_BYPASS_STAGES = ['dev', 'test', 'local'];

function issue(severity, code, pointer, message, hint) {
    return { severity, code, pointer, message, hint };
}

/** Keys the schema marks `deprecated` (nothing reads them) that the app sets. */
function checkDeprecatedKeys({ raw }) {
    const issues = [];
    const walk = (schemaNode, data, pointer) => {
        if (
            !schemaNode?.properties ||
            data === null ||
            typeof data !== 'object'
        )
            return;
        for (const [key, child] of Object.entries(schemaNode.properties)) {
            if (data[key] === undefined) continue;
            const childPointer = `${pointer}/${key}`;
            if (child.deprecated) {
                const alias = key === 'password' && pointer === '/user';
                issues.push(
                    issue(
                        'warning',
                        alias ? 'deprecated-alias' : 'no-effect',
                        childPointer,
                        alias
                            ? 'user.password is the deprecated spelling of user.usePassword.'
                            : `${childPointer
                                  .slice(1)
                                  .replace(
                                      /\//g,
                                      '.'
                                  )} is not read by Frigg: it has no effect.`,
                        alias ? 'Rename it to usePassword.' : 'Remove it.'
                    )
                );
                continue;
            }
            walk(child, data[key], childPointer);
        }
    };
    walk(getSchema('app-definition'), raw, '');
    return issues;
}

function checkManagement({ raw }) {
    const issues = [];
    const mode = raw.managementMode;
    const vpc = raw.vpc || {};
    const postgres = raw.database?.postgres || {};

    if (mode === 'custom') {
        issues.push(
            issue(
                'warning',
                'no-effect',
                '/managementMode',
                "managementMode 'custom' behaves like 'discover'.",
                "Use 'discover', or remove the key."
            )
        );
    }
    if (mode === 'managed' && raw.vpcIsolation === undefined) {
        issues.push(
            issue(
                'warning',
                'ambiguous-default',
                '/vpcIsolation',
                "managementMode 'managed' without vpcIsolation: the builders do not agree on a default (some treat it as 'shared', some as 'isolated').",
                "Set vpcIsolation to 'isolated' (resources per stage) or 'shared'."
            )
        );
    }
    if (mode === 'managed') {
        for (const [key, value] of [
            ['management', vpc.management],
            ['subnets/management', vpc.subnets?.management],
            ['natGateway/management', vpc.natGateway?.management],
            ['shareAcrossStages', vpc.shareAcrossStages],
        ]) {
            if (value !== undefined) {
                issues.push(
                    issue(
                        'warning',
                        'conflicting-settings',
                        `/vpc/${key}`,
                        `managementMode 'managed' and vpc.${key.replace(
                            '/',
                            '.'
                        )} are both set. The build logs that it ignores vpc.${key.replace(
                            '/',
                            '.'
                        )}, but the VPC builder still applies it on top of the managed settings.`,
                        `Remove vpc.${key.replace(
                            '/',
                            '.'
                        )}, or drop managementMode 'managed'.`
                    )
                );
            }
        }
    }
    if (
        (mode === 'managed' || mode === 'existing') &&
        postgres.management !== undefined &&
        postgres.management !== 'external'
    ) {
        issues.push(
            issue(
                'warning',
                'no-effect',
                '/database/postgres/management',
                `database.postgres.management is ignored when managementMode is '${mode}'.`,
                'Remove it.'
            )
        );
    }

    for (const [pointer, value, useful] of [
        [
            '/vpc/subnets/management',
            vpc.subnets?.management,
            "'create' or 'use-existing'",
        ],
        [
            '/vpc/natGateway/management',
            vpc.natGateway?.management,
            "'createAndManage', or set natGateway.id",
        ],
    ]) {
        if (['discover', 'create-new', 'existing'].includes(value)) {
            issues.push(
                issue(
                    'warning',
                    'no-effect',
                    pointer,
                    `${pointer
                        .slice(1)
                        .replace(
                            /\//g,
                            '.'
                        )} '${value}' has no effect: the VPC builder ignores it.`,
                    `Use ${useful}, or remove it.`
                )
            );
        }
    }

    if (
        vpc.enable === true &&
        vpc.management === 'use-existing' &&
        !vpc.vpcId &&
        !vpc.ownership
    ) {
        issues.push(
            issue(
                'error',
                'missing-key',
                '/vpc/vpcId',
                "vpc.management 'use-existing' needs vpc.vpcId; the VPC builder fails without it.",
                'Set vpc.vpcId (vpc-...).'
            )
        );
    }
    if (
        vpc.enable === true &&
        vpc.subnets?.management === 'use-existing' &&
        !(Array.isArray(vpc.subnets.ids) && vpc.subnets.ids.length >= 2)
    ) {
        issues.push(
            issue(
                'error',
                'missing-key',
                '/vpc/subnets/ids',
                "vpc.subnets.management 'use-existing' needs at least 2 subnet ids; the VPC builder fails without them.",
                'Set vpc.subnets.ids.'
            )
        );
    }
    if (
        postgres.enable === true &&
        postgres.management === 'use-existing' &&
        !postgres.endpoint &&
        mode !== 'managed' &&
        mode !== 'existing'
    ) {
        issues.push(
            issue(
                'error',
                'missing-key',
                '/database/postgres/endpoint',
                "database.postgres.management 'use-existing' needs database.postgres.endpoint; the Aurora builder fails without it.",
                'Set the endpoint host name.'
            )
        );
    }
    const provisionsAurora =
        postgres.enable === true &&
        postgres.management !== 'use-existing' &&
        postgres.management !== 'external';
    if (
        provisionsAurora &&
        vpc.enable !== true &&
        postgres.publiclyAccessible !== true
    ) {
        issues.push(
            issue(
                'warning',
                'unreachable-database',
                '/vpc/enable',
                'Frigg provisions or discovers a private Aurora cluster, but the Lambda functions run outside a VPC and cannot reach it.',
                "Set vpc.enable: true, or use database.postgres.management: 'use-existing' with a reachable endpoint."
            )
        );
    }
    return issues;
}

function checkDatabase({ raw }) {
    const database = raw.database;
    const enabled = ['postgres', 'mongoDB', 'documentDB'].filter(
        (key) => database?.[key]?.enable === true
    );
    if (enabled.length === 0) {
        return [
            issue(
                'error',
                'no-database',
                '/database',
                'No database is enabled. Core refuses to start without one (database.postgres, database.mongoDB or database.documentDB with enable: true).',
                'Add `database: { postgres: { enable: true } }` (or mongoDB / documentDB).'
            ),
        ];
    }
    if (enabled.length > 1) {
        return [
            issue(
                'warning',
                'several-databases',
                '/database',
                `Several databases are enabled (${enabled.join(
                    ', '
                )}); core uses ${enabled[0]}.`,
                'Enable only the database the app uses.'
            ),
        ];
    }
    return [];
}

function checkEncryption({ raw, stage, env }) {
    const issues = [];
    const method = raw.encryption?.fieldLevelEncryptionMethod;
    const environment = raw.environment || {};
    const deployedStage = stage && !ENCRYPTION_BYPASS_STAGES.includes(stage);

    if (method === 'aes') {
        for (const key of ['AES_KEY_ID', 'AES_KEY']) {
            if (environment[key] !== true) {
                issues.push(
                    issue(
                        'error',
                        'missing-encryption-env',
                        `/environment/${key}`,
                        `fieldLevelEncryptionMethod 'aes' needs ${key} in the Lambda environment, and only keys listed in \`environment\` (as true) reach it. Without it, deployed stages store sensitive fields unencrypted.`,
                        `Add \`${key}: true\` to environment (it cannot be offloaded to SSM).`
                    )
                );
            } else if (deployedStage && !env[key]) {
                issues.push(
                    issue(
                        'warning',
                        'missing-env-value',
                        `/environment/${key}`,
                        `${key} is not set in this shell; \`frigg deploy --stage ${stage}\` would deploy it empty.`,
                        `Export ${key} before deploying.`
                    )
                );
            }
        }
    }
    if (
        method === 'kms' &&
        raw.managementMode !== 'managed' &&
        raw.encryption?.createResourceIfNoneFound === undefined &&
        !raw.encryption?.ownership
    ) {
        issues.push(
            issue(
                'warning',
                'kms-key-source',
                '/encryption/createResourceIfNoneFound',
                'With no KMS key found by discovery, KMS_KEY_ARN falls back to the AWS_DISCOVERY_KMS_KEY_ID environment variable.',
                "Set createResourceIfNoneFound: true (or managementMode: 'managed') to let Frigg create the key."
            )
        );
    }
    if (method === undefined && deployedStage) {
        issues.push(
            issue(
                'warning',
                'no-field-encryption',
                '/encryption/fieldLevelEncryptionMethod',
                `No field-level encryption method: stage '${stage}' stores credentials and tokens unencrypted.`,
                "Set encryption.fieldLevelEncryptionMethod to 'kms' (Frigg creates the key) or 'aes'."
            )
        );
    }
    if (
        method !== undefined &&
        stage &&
        ENCRYPTION_BYPASS_STAGES.includes(stage)
    ) {
        issues.push(
            issue(
                'warning',
                'encryption-bypassed',
                '/encryption/fieldLevelEncryptionMethod',
                `Core skips field-level encryption when STAGE is ${ENCRYPTION_BYPASS_STAGES.join(
                    ', '
                )}; stage '${stage}' stores sensitive fields unencrypted even when deployed.`,
                'Deploy production data to another stage name (e.g. prod).'
            )
        );
    }
    return issues;
}

function checkUser({ definition, raw }) {
    const issues = [];
    const user = definition.user || {};
    const authModes = user.authModes;

    if (
        user.individualUserRequired === false &&
        user.organizationUserRequired !== true
    ) {
        issues.push(
            issue(
                'error',
                'no-login',
                '/user',
                'Neither individual nor organization users are required: POST /user/login always fails.',
                'Set user.individualUserRequired: true (the default) or user.organizationUserRequired: true.'
            )
        );
    }
    if (
        raw.user?.organizationUserRequired === true &&
        raw.user?.individualUserRequired === undefined
    ) {
        issues.push(
            issue(
                'warning',
                'default-changed',
                '/user/individualUserRequired',
                'individualUserRequired is not set, so it defaults to true: login and x-frigg headers look up an individual user first.',
                'For organization-only login, set user.individualUserRequired: false.'
            )
        );
    }
    if (authModes) {
        const anyMode =
            authModes.friggToken !== false ||
            authModes.sharedSecret !== false ||
            authModes.adopterJwt === true;
        if (!anyMode) {
            issues.push(
                issue(
                    'error',
                    'no-auth-mode',
                    '/user/authModes',
                    'Every authentication mode is disabled: no request can authenticate.',
                    'Enable friggToken, sharedSecret or adopterJwt.'
                )
            );
        }
        if (authModes.adopterJwt === true && !user.jwtConfig?.secret) {
            issues.push(
                issue(
                    'error',
                    'missing-key',
                    '/user/jwtConfig/secret',
                    'authModes.adopterJwt needs user.jwtConfig.secret to verify tokens.',
                    'Set user.jwtConfig: { secret: process.env.JWT_SECRET }.'
                )
            );
        }
        if (
            raw.user?.authModes?.sharedSecret === true &&
            !raw.environment?.FRIGG_API_KEY
        ) {
            issues.push(
                issue(
                    'warning',
                    'missing-env',
                    '/environment/FRIGG_API_KEY',
                    'authModes.sharedSecret checks x-frigg-api-key against FRIGG_API_KEY, which is not listed in environment.',
                    "Add FRIGG_API_KEY: true (or 'ssm') to environment."
                )
            );
        }
    }
    return issues;
}

function checkEnvironment({ raw }) {
    const issues = [];
    const environment = raw.environment || {};
    if (raw.ssm?.enable !== true) {
        for (const [key, value] of Object.entries(environment)) {
            if (value === 'ssm') {
                issues.push(
                    issue(
                        'warning',
                        'ssm-inactive',
                        `/environment/${key}`,
                        `${key} is marked 'ssm' but ssm.enable is not true, so it is passed in the Lambda environment instead.`,
                        'Set ssm: { enable: true } to offload it.'
                    )
                );
            }
        }
    }
    return issues;
}

const CHECKS = [
    checkDeprecatedKeys,
    checkManagement,
    checkDatabase,
    checkEncryption,
    checkUser,
    checkEnvironment,
];

/**
 * @param {object} context
 * @param {object} context.definition app definition with defaults applied
 * @param {object} context.raw app definition as written
 * @param {string} [context.stage]
 * @param {object} [context.env]
 */
function checkConfig({ definition, raw, stage, env = process.env }) {
    return CHECKS.flatMap((check) => check({ definition, raw, stage, env }));
}

module.exports = {
    checkConfig,
    checkDeprecatedKeys,
    checkManagement,
    checkDatabase,
    checkEncryption,
    checkUser,
    checkEnvironment,
};
