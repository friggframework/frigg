/**
 * The app-definition schema describes what the runtime reads (ADR-051).
 * These cases pin the drift fixed there: each one used to pass the schema
 * and fail the build, or fail the schema while the runtime accepted it.
 */
const { validateAppDefinition, getSchema } = require('../index');

const valid = (definition) =>
    validateAppDefinition({ integrations: [], ...definition });

describe('app-definition schema matches the builders', () => {
    test.each(['discover', 'managed', 'use-existing'])(
        "accepts database.postgres.management '%s' (the Aurora builder's values)",
        (management) => {
            expect(
                valid({ database: { postgres: { enable: true, management } } })
                    .valid
            ).toBe(true);
        }
    );

    test.each(['existing', 'create-new'])(
        "rejects database.postgres.management '%s', which the Aurora builder rejects",
        (management) => {
            expect(
                valid({ database: { postgres: { enable: true, management } } })
                    .valid
            ).toBe(false);
        }
    );

    test.each(['discover', 'create-new', 'use-existing'])(
        "accepts vpc.management '%s' (the VPC builder's values)",
        (management) => {
            expect(valid({ vpc: { enable: true, management } }).valid).toBe(
                true
            );
        }
    );

    test("rejects vpc.management 'existing', which the VPC builder rejects", () => {
        expect(
            valid({ vpc: { enable: true, management: 'existing' } }).valid
        ).toBe(false);
    });

    test('accepts the subnet and NAT values the VPC builder acts on', () => {
        expect(
            valid({
                vpc: {
                    enable: true,
                    subnets: { management: 'create' },
                    natGateway: { management: 'createAndManage' },
                },
            }).valid
        ).toBe(true);
    });

    test("accepts managementMode 'existing'", () => {
        expect(valid({ managementMode: 'existing' }).valid).toBe(true);
    });

    test('accepts the ownership-based configuration the resolvers read', () => {
        const result = valid({
            vpc: {
                enable: true,
                ownership: {
                    vpc: 'external',
                    securityGroup: 'stack',
                    subnets: 'auto',
                    natGateway: 'auto',
                    vpcEndpoints: 'stack',
                },
                external: {
                    vpcId: 'vpc-123',
                    subnetIds: ['subnet-1', 'subnet-2'],
                    vpcEndpointIds: { s3: 'vpce-1' },
                },
                config: {
                    cidrBlock: '10.1.0.0/16',
                    selfHeal: false,
                    natGateway: { enable: false },
                    enableVpcEndpoints: true,
                },
                shareAcrossStages: false,
            },
            database: {
                postgres: {
                    enable: true,
                    engineVersion: '15.13',
                    ownership: {
                        cluster: 'external',
                        instance: 'external',
                        subnetGroup: 'stack',
                        secret: 'external',
                    },
                    external: {
                        clusterIdentifier: 'c',
                        instanceIdentifier: 'i',
                        subnetGroupName: 'g',
                        secretArn: 'arn:x',
                    },
                },
                dynamodb: { enable: true },
            },
            encryption: {
                fieldLevelEncryptionMethod: 'kms',
                ownership: { key: 'stack' },
                kmsKeyAlias: true,
                keyAlias: 'alias/app',
                disable: { Credential: ['data.domain'] },
            },
            migration: { ownership: { bucket: 'stack', queue: 'auto' } },
        });

        expect(result.errors).toBe(null);
    });

    test('accepts the other keys the runtime reads', () => {
        class Script {
            static Definition = { name: 'script' };
        }
        const result = valid({
            usePrismaLambdaLayer: false,
            stage: 'dev',
            lambda: { scopedEnvironment: true, keepNestedNodeModules: true },
            scheduler: { enable: true },
            aws: { discovery: { enabled: false, failOnError: true } },
            telemetry: {
                exporter: { type: 'honeycomb', apiKey: 'k' },
                sampleRatio: 0.5,
                northStar: {
                    default: { name: 'records_synced' },
                    byType: { crm: { name: 'contacts' } },
                },
                subscribers: [() => {}],
            },
            admin: { includeBuiltinReports: true, enableScheduling: true },
            adminScripts: [Script],
            reports: [Script],
            deployment: { skipPostDeploymentHealthCheck: true },
            user: { strictUserValidation: true },
        });

        expect(result.errors).toBe(null);
    });
});

describe('app-definition schema defaults are the runtime defaults', () => {
    const schema = getSchema('app-definition');

    test('no default encryption method: omitting it provisions no key', () => {
        expect(
            schema.properties.encryption.properties.fieldLevelEncryptionMethod
                .default
        ).toBeUndefined();
    });

    test('no default management mode or isolation, which the builders do not agree on', () => {
        expect(schema.properties.managementMode.default).toBeUndefined();
        expect(schema.properties.vpcIsolation.default).toBeUndefined();
    });

    test('Aurora maxCapacity default is the builder default (4)', () => {
        expect(
            schema.properties.database.properties.postgres.properties
                .maxCapacity.default
        ).toBe(4);
    });

    test('keys nothing reads are deprecated and carry no default', () => {
        const deprecated = [
            schema.properties.label,
            schema.properties.auth,
            schema.properties.security,
            schema.properties.webhooks,
            schema.properties.custom,
            schema.properties.secretsManager,
            schema.properties.user.properties.password,
            schema.properties.database.properties.postgres.properties.selfHeal,
        ];
        for (const node of deprecated) {
            expect(node.deprecated).toBe(true);
            expect(node.default).toBeUndefined();
        }
    });
});
