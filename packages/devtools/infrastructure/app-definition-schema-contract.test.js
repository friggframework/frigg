/**
 * Contract between the app-definition schema and the infrastructure
 * builders (ADR-051). It composes the infrastructure for a matrix of app
 * definitions, records every app-definition key the builders read, and
 * asserts that:
 *
 *   1. every key a builder reads is described by the schema;
 *   2. every key the schema describes is read by a builder, or is listed in
 *      READ_OUTSIDE_THE_BUILDERS with the code that reads it, or is marked
 *      `deprecated` in the schema (no reader);
 *   3. no builder reads a key the schema marks `deprecated`;
 *   4. applying the schema defaults changes nothing in the composed
 *      infrastructure: each schema default is the builders' own default;
 *   5. the schema accepts every definition in the matrix (keys and values).
 *
 * When this test fails, change the schema and the runtime together.
 */

const createDiscoveryResponse = (overrides = {}) => ({
    defaultVpcId: 'vpc-123456',
    vpcCidr: '172.31.0.0/16',
    defaultSecurityGroupId: 'sg-123456',
    privateSubnetId1: 'subnet-123456',
    privateSubnetId2: 'subnet-789012',
    publicSubnetId: 'subnet-public',
    publicSubnetId1: 'subnet-public-1',
    publicSubnetId2: 'subnet-public-2',
    defaultRouteTableId: 'rtb-123456',
    defaultKmsKeyId:
        'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012',
    existingNatGatewayId: 'nat-default123',
    auroraClusterEndpoint:
        'test-cluster.cluster-abc123.us-east-1.rds.amazonaws.com',
    auroraPort: 5432,
    auroraEngine: 'aurora-postgresql',
    ...overrides,
});

jest.mock('./domains/shared/resource-discovery', () => {
    const actual = jest.requireActual('./domains/shared/resource-discovery');
    return { ...actual, gatherDiscoveredResources: jest.fn() };
});
jest.mock('./domains/shared/utilities/prisma-layer-manager', () => ({
    ensurePrismaLayerExists: jest.fn().mockResolvedValue(undefined),
}));

const {
    gatherDiscoveredResources,
} = require('./domains/shared/resource-discovery');
const { composeServerlessDefinition } = require('./infrastructure-composer');
const {
    getSchema,
    applyAppDefinitionDefaults,
    validateAppDefinition,
} = require('@friggframework/schemas');

const schema = getSchema('app-definition');

/**
 * Schema keys no builder reads, with the code that does read them. Keep
 * this list short: a key here is checked only by its own tests.
 */
const READ_OUTSIDE_THE_BUILDERS = {
    user: 'core: handlers/app-definition-loader.js (userConfig), user/use-cases/*',
    'user.*': 'core: user/use-cases/* (login, authenticate, x-frigg headers)',
    'telemetry.*':
        'core: telemetry/telemetry-config.js (only exporter.type is read by the environment builder)',
    'encryption.schema':
        'core: database/encryption/encryption-schema-registry.js',
    'encryption.schema.*':
        'core: database/encryption/encryption-schema-registry.js',
    'encryption.disable':
        'core: database/encryption/encryption-schema-registry.js',
    'encryption.disable.*':
        'core: database/encryption/encryption-schema-registry.js',
    'encryption.keyAlias':
        'devtools: shared/resource-discovery.js (discovery filter; discovery is mocked here)',
    'database.postgres.clusterId':
        'devtools: shared/resource-discovery.js (discovery filter)',
    'database.postgres.instanceId':
        'devtools: shared/resource-discovery.js (discovery filter)',
    'database.mongoDB':
        'core: database/config.js; devtools: scripts/build-prisma-layer.js (mocked here)',
    'database.mongoDB.enable':
        'core: database/config.js; devtools: scripts/build-prisma-layer.js (mocked here)',
    'database.documentDB.enable':
        'core: database/config.js; devtools: scripts/build-prisma-layer.js (mocked here)',
    aws: 'devtools: shared/resource-discovery.js shouldRunDiscovery (discovery is mocked here)',
    'aws.*': 'devtools: shared/resource-discovery.js',
    'vpc.selfHeal':
        'devtools: shared/resource-discovery.js (route-table repair) and vpc-builder translation',
    deployment: 'frigg-cli: deploy-command/index.js',
    'deployment.*': 'frigg-cli: deploy-command/index.js',
    'ssm.parameters.*': 'frigg-cli: ssm-command/index.js (type, tier)',
    'admin.*':
        'admin-scripts: src/infrastructure/bootstrap.js; devtools: admin-script-builder.js',
    stage: 'devtools: security/kms-builder.js alias inference (only without discovery)',
    'logging.format': 'informational: records are always JSON',
};

// ---------------------------------------------------------------------------
// Schema navigation

function isObjectSchema(node) {
    return (
        node &&
        (node.properties ||
            node.patternProperties ||
            typeof node.additionalProperties === 'object')
    );
}

/** The schema node describing `segments`, or null when the schema has none. */
function schemaNodeFor(segments) {
    let node = schema;
    for (const segment of segments) {
        if (!node) return null;
        if (node.type === 'array' || node.items) {
            node = node.items;
            if (segment === '[]') continue;
        }
        if (node.properties && node.properties[segment]) {
            node = node.properties[segment];
            continue;
        }
        const pattern = Object.entries(node.patternProperties || {}).find(
            ([re]) => new RegExp(re).test(segment)
        );
        if (pattern) {
            node = pattern[1];
            continue;
        }
        if (
            node.additionalProperties &&
            typeof node.additionalProperties === 'object'
        ) {
            node = node.additionalProperties;
            continue;
        }
        if (node.additionalProperties === true) return { open: true };
        return null;
    }
    return node;
}

function isDeprecated(segments) {
    let node = schema;
    for (const segment of segments) {
        node = node?.properties?.[segment];
        if (!node) return false;
        if (node.deprecated) return true;
    }
    return false;
}

/** Every key path the schema declares (dot paths, `*` for pattern keys). */
function schemaPaths(node = schema, prefix = []) {
    const paths = [];
    for (const [key, child] of Object.entries(node.properties || {})) {
        const path = [...prefix, key];
        paths.push(path);
        if (isObjectSchema(child)) paths.push(...schemaPaths(child, path));
    }
    if (node.patternProperties) {
        for (const child of Object.values(node.patternProperties)) {
            paths.push([...prefix, '*']);
            if (isObjectSchema(child))
                paths.push(...schemaPaths(child, [...prefix, '*']));
        }
    }
    return paths;
}

// ---------------------------------------------------------------------------
// Read recording

const IGNORED_PROPS = new Set([
    'toJSON',
    'constructor',
    'then',
    'valueOf',
    'toString',
    'inspect',
    'asymmetricMatch',
    '$$typeof',
    'nodeType',
    '@@__IMMUTABLE_ITERABLE__@@',
    '@@__IMMUTABLE_RECORD__@@',
]);

function isPlainObject(value) {
    if (value === null || typeof value !== 'object') return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

/**
 * Wrap a definition so every property read is recorded as a dot path.
 * Arrays and classes are returned as they are (integrations are classes).
 */
function recordReads(definition, reads) {
    const wrap = (target, path) =>
        new Proxy(target, {
            get(obj, prop, receiver) {
                const value = Reflect.get(obj, prop, receiver);
                if (typeof prop === 'symbol' || IGNORED_PROPS.has(prop))
                    return value;
                const next = [...path, prop];
                reads.add(next.join('.'));
                return isPlainObject(value) ? wrap(value, next) : value;
            },
        });
    return wrap(definition, []);
}

// ---------------------------------------------------------------------------
// The matrix

class WebhookIntegration {
    static Definition = {
        name: 'acme',
        version: '1.0.0',
        modules: {},
        webhooks: true,
    };
}
class PlainIntegration {
    static Definition = { name: 'plain', version: '1.0.0', modules: {} };
}
class Script {
    static Definition = {
        name: 'cleanup',
        version: '1.0.0',
        schedule: { enabled: false },
    };
}
class Report {
    static Definition = {
        name: 'usage',
        version: '1.0.0',
        output: { format: 'csv' },
    };
}

const base = () => ({
    name: 'contract-app',
    provider: 'aws',
    integrations: [PlainIntegration],
    environment: { DATABASE_URL: true, API_KEY: 'ssm' },
});

const MATRIX = {
    minimal: () => ({ ...base() }),
    'scaffold (external db, kms, no vpc)': () => ({
        ...base(),
        user: { usePassword: true },
        encryption: { fieldLevelEncryptionMethod: 'kms' },
        managementMode: 'managed',
        vpcIsolation: 'isolated',
        vpc: { enable: false },
        database: {
            postgres: {
                enable: true,
                management: 'use-existing',
                endpoint: 'db.example.com',
                port: 5432,
                database: 'frigg',
                username: 'frigg',
            },
        },
        logging: { level: 'debug', retentionInDays: 14 },
        ssm: {
            enable: true,
            parameterPrefix: '/frigg/contract',
            kmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/abc',
            restrictIamToPrefix: true,
            parameters: { API_KEY: { type: 'SecureString', tier: 'standard' } },
        },
        lambda: { scopedEnvironment: true, keepNestedNodeModules: false },
        usePrismaLambdaLayer: true,
    }),
    'vpc discover + aurora discover + kms create': () => ({
        ...base(),
        integrations: [WebhookIntegration, PlainIntegration],
        vpc: {
            enable: true,
            management: 'discover',
            enableVPCEndpoints: true,
            selfHeal: true,
            cidrBlock: '10.0.0.0/16',
        },
        database: {
            postgres: {
                enable: true,
                management: 'discover',
                minCapacity: 0.5,
                maxCapacity: 2,
                publiclyAccessible: false,
                autoCreateCredentials: false,
                engineVersion: '15.13',
            },
            dynamodb: { enable: true },
        },
        encryption: {
            fieldLevelEncryptionMethod: 'kms',
            createResourceIfNoneFound: true,
            kmsKeyAlias: true,
        },
        websockets: { enable: true },
        scheduler: { enable: true },
        telemetry: {
            exporter: { type: 'otlp', endpoint: 'https://otel.example.com' },
        },
    }),
    'vpc create-new + aurora managed': () => ({
        ...base(),
        vpc: {
            enable: true,
            management: 'create-new',
            subnets: { management: 'create' },
            natGateway: { management: 'createAndManage' },
            shareAcrossStages: false,
        },
        database: { postgres: { enable: true, management: 'managed' } },
        encryption: { fieldLevelEncryptionMethod: 'aes' },
    }),
    'vpc use-existing': () => ({
        ...base(),
        vpc: {
            enable: true,
            management: 'use-existing',
            vpcId: 'vpc-abc',
            securityGroupIds: ['sg-abc'],
            subnets: {
                management: 'use-existing',
                ids: ['subnet-a', 'subnet-b'],
            },
            natGateway: { id: 'nat-abc' },
        },
    }),
    'managed + isolated': () => ({
        ...base(),
        managementMode: 'managed',
        vpcIsolation: 'isolated',
        vpc: { enable: true },
        database: { postgres: { enable: true } },
        encryption: { fieldLevelEncryptionMethod: 'kms' },
    }),
    'managed + shared': () => ({
        ...base(),
        managementMode: 'managed',
        vpcIsolation: 'shared',
        vpc: { enable: true },
        database: { postgres: { enable: true } },
        encryption: { fieldLevelEncryptionMethod: 'kms' },
    }),
    'existing mode': () => ({
        ...base(),
        managementMode: 'existing',
        vpc: {
            enable: true,
            external: {
                vpcId: 'vpc-x',
                subnetIds: ['subnet-a', 'subnet-b'],
                securityGroupIds: ['sg-x'],
            },
        },
        database: {
            postgres: {
                enable: true,
                external: {
                    clusterIdentifier: 'c',
                    instanceIdentifier: 'i',
                    subnetGroupName: 'g',
                    secretArn: 'arn:aws:secretsmanager:us-east-1:1:secret:x',
                },
            },
        },
    }),
    'ownership-based': () => ({
        ...base(),
        vpc: {
            enable: true,
            ownership: {
                vpc: 'stack',
                securityGroup: 'stack',
                subnets: 'stack',
                natGateway: 'stack',
                vpcEndpoints: 'stack',
            },
            config: {
                cidrBlock: '10.2.0.0/16',
                selfHeal: true,
                natGateway: { enable: true },
                enableVpcEndpoints: true,
            },
        },
        database: {
            postgres: {
                enable: true,
                ownership: {
                    cluster: 'stack',
                    instance: 'stack',
                    subnetGroup: 'stack',
                    secret: 'stack',
                },
            },
        },
        encryption: {
            fieldLevelEncryptionMethod: 'kms',
            ownership: { key: 'stack' },
        },
        migration: { ownership: { bucket: 'stack', queue: 'stack' } },
    }),
    'ownership-based, external': () => ({
        ...base(),
        vpc: {
            enable: true,
            ownership: {
                vpc: 'external',
                securityGroup: 'external',
                subnets: 'external',
                natGateway: 'external',
                vpcEndpoints: 'external',
            },
            external: {
                vpcId: 'vpc-ext',
                securityGroupIds: ['sg-ext'],
                subnetIds: ['subnet-e1', 'subnet-e2'],
                natGatewayId: 'nat-ext',
                vpcEndpointIds: { s3: 'vpce-s3', dynamodb: 'vpce-ddb' },
            },
        },
    }),
    'admin scripts and reports': () => ({
        ...base(),
        adminScripts: [Script],
        reports: [Report],
        admin: { includeBuiltinReports: true, enableScheduling: true },
        database: { postgres: { enable: false }, mongoDB: { enable: true } },
    }),
    documentdb: () => ({
        ...base(),
        database: {
            documentDB: {
                enable: true,
                tlsCAFile: './security/global-bundle.pem',
            },
        },
        usePrismaLambdaLayer: false,
    }),
};

// ---------------------------------------------------------------------------

async function compose(definition) {
    return composeServerlessDefinition(definition);
}

describe('app-definition schema ⇄ infrastructure builders contract (ADR-051)', () => {
    const reads = new Set();
    const composed = {};
    let logSpy;
    let warnSpy;
    let errorSpy;
    const savedArgv = process.argv;
    const savedEnv = { ...process.env };

    beforeAll(async () => {
        logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        process.argv = ['node', 'test'];
        delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
        process.env.AWS_REGION = 'us-east-1';
        gatherDiscoveredResources.mockImplementation(async () =>
            createDiscoveryResponse()
        );

        for (const [name, make] of Object.entries(MATRIX)) {
            composed[name] = await compose(recordReads(make(), reads));
        }
    });

    afterAll(() => {
        logSpy.mockRestore();
        warnSpy.mockRestore();
        errorSpy.mockRestore();
        process.argv = savedArgv;
        process.env = savedEnv;
    });

    it('composes every definition in the matrix', () => {
        for (const name of Object.keys(MATRIX)) {
            expect(composed[name]).toEqual(
                expect.objectContaining({ service: expect.any(String) })
            );
        }
    });

    it('the schema accepts every definition the builders compose', () => {
        const invalid = Object.entries(MATRIX)
            .map(([name, make]) => [name, validateAppDefinition(make()).errors])
            .filter(([, errors]) => errors);

        expect(invalid).toEqual([]);
    });

    it('records the reads (sanity check of the recorder)', () => {
        for (const path of [
            'vpc.management',
            'database.postgres.management',
            'encryption.fieldLevelEncryptionMethod',
            'managementMode',
            'environment.DATABASE_URL',
        ]) {
            expect([path, reads.has(path)]).toEqual([path, true]);
        }
    });

    it('every key a builder reads is in the schema', () => {
        const missing = [...reads]
            .map((path) => path.split('.'))
            // integrations[i] are classes: their Definition is checked by `frigg validate`.
            .filter(
                (segments) =>
                    !['integrations', 'adminScripts', 'reports'].includes(
                        segments[0]
                    ) || segments.length === 1
            )
            // Keys a builder writes into its own translated copy (e.g. vpc._x) are internal.
            .filter((segments) => !segments.some((s) => s.startsWith('_')))
            .filter((segments) => schemaNodeFor(segments) === null)
            .map((segments) => segments.join('.'));

        expect(missing).toEqual([]);
    });

    it('no builder reads a key the schema marks deprecated', () => {
        const readDeprecated = [...reads].filter((path) =>
            isDeprecated(path.split('.'))
        );

        expect(readDeprecated).toEqual([]);
    });

    it('every schema key is read by a builder, read elsewhere (listed), or deprecated', () => {
        const readPaths = new Set(reads);
        const isRead = (segments) => {
            const dotted = segments.join('.');
            if (readPaths.has(dotted)) return true;
            // `*` (patternProperties) matches any concrete key read
            if (segments.includes('*')) {
                const re = new RegExp(
                    `^${segments
                        .map((s) =>
                            s === '*' ? '[^.]+' : s.replace(/[.$]/g, '\\$&')
                        )
                        .join('\\.')}$`
                );
                return [...readPaths].some((p) => re.test(p));
            }
            return false;
        };
        const listedElsewhere = (segments) => {
            for (let i = segments.length; i > 0; i--) {
                const prefix = segments.slice(0, i).join('.');
                if (READ_OUTSIDE_THE_BUILDERS[prefix] && i === segments.length)
                    return true;
                if (
                    READ_OUTSIDE_THE_BUILDERS[`${prefix}.*`] &&
                    i < segments.length
                )
                    return true;
            }
            return false;
        };

        const unread = schemaPaths()
            .filter(
                (segments) => !isDeprecated(segments.filter((s) => s !== '*'))
            )
            .filter(
                (segments) => !isRead(segments) && !listedElsewhere(segments)
            )
            .map((segments) => segments.join('.'));

        expect(unread).toEqual([]);
    });

    it('applying the schema defaults does not change the composed infrastructure', async () => {
        const differences = [];
        for (const [name, make] of Object.entries(MATRIX)) {
            const withoutDefaults = await compose(make());
            const withDefaults = await compose(
                applyAppDefinitionDefaults(make())
            );
            try {
                expect(withDefaults).toEqual(withoutDefaults);
            } catch (error) {
                differences.push(`${name}:\n${error.message}`);
            }
        }

        expect(differences).toEqual([]);
    });
});
