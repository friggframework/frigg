const { validateDefinition } = require('../validate-app-definition');

class Api {
    static requesterType = 'oauth2';
}
const auth = {
    getToken: async () => {},
    getEntityDetails: async () => {},
    getCredentialDetails: async () => {},
    testAuthRequest: async () => {},
    apiPropertiesToPersist: { credential: [], entity: [] },
};
class AcmeIntegration {
    static Definition = {
        name: 'acme',
        version: '1.0.0',
        modules: {
            acme: {
                definition: {
                    moduleName: 'acme',
                    API: Api,
                    requiredAuthMethods: auth,
                },
            },
        },
    };
}

/** The app `frigg init` scaffolds, with one integration installed. */
const scaffold = (overrides = {}) => ({
    name: 'frigg-app',
    integrations: [AcmeIntegration],
    user: {
        usePassword: true,
        primary: 'individual',
        individualUserRequired: true,
        organizationUserRequired: false,
    },
    encryption: { fieldLevelEncryptionMethod: 'kms' },
    managementMode: 'managed',
    vpcIsolation: 'isolated',
    vpc: { enable: false },
    database: {
        postgres: {
            enable: true,
            management: 'use-existing',
            endpoint: 'db.example.com',
        },
    },
    environment: { DATABASE_URL: true },
    logging: { retentionInDays: 14 },
    ssm: { enable: false },
    ...overrides,
});

const summary = ({ errors, warnings }) => ({
    errors: errors.map((i) => `${i.code} ${i.pointer}`),
    warnings: warnings.map((i) => `${i.code} ${i.pointer}`),
});

describe('validateDefinition', () => {
    it('passes a scaffolded app with an integration class', () => {
        expect(
            summary(
                validateDefinition({
                    definition: scaffold(),
                    stage: 'prod',
                    env: {},
                })
            )
        ).toEqual({
            errors: [],
            warnings: ['no-effect /database/postgres/management'],
        });
    });

    it('reports schema errors with JSON pointers and fix hints', () => {
        const result = validateDefinition({
            definition: scaffold({
                vpc: { enable: false, mangement: 'discover' },
                logging: { level: 'loud' },
            }),
            env: {},
        });

        expect(result.errors).toEqual([
            expect.objectContaining({
                code: 'unknown-key',
                pointer: '/vpc/mangement',
                hint: 'Did you mean "management"?',
            }),
            expect.objectContaining({
                code: 'invalid-value',
                pointer: '/logging/level',
                hint: expect.stringContaining('"debug"'),
            }),
        ]);
    });

    it("rejects database.postgres.management 'existing', which the Aurora builder rejects", () => {
        const definition = scaffold({
            managementMode: undefined,
            database: { postgres: { enable: true, management: 'existing' } },
            vpc: { enable: true },
        });

        expect(
            summary(validateDefinition({ definition, env: {} })).errors
        ).toEqual(['invalid-value /database/postgres/management']);
    });

    it('reports a broken integration class', () => {
        class Broken {
            static Definition = { name: 'broken' };
        }
        const result = validateDefinition({
            definition: scaffold({ integrations: [Broken] }),
            env: {},
        });

        expect(summary(result).errors).toEqual([
            'integration-modules-missing /integrations/0/Definition/modules',
        ]);
    });

    it('reports an integration that is not a class once', () => {
        const result = validateDefinition({
            definition: scaffold({ integrations: ['acme'] }),
            env: {},
        });

        expect(summary(result).errors).toEqual([
            'integration-not-a-class /integrations/0',
        ]);
    });

    it('reports a missing database', () => {
        const result = validateDefinition({
            definition: scaffold({ database: undefined }),
            env: {},
        });

        expect(summary(result).errors).toEqual(['no-database /database']);
    });

    it('a non-object definition is a schema error, not a crash', () => {
        expect(
            summary(validateDefinition({ definition: 'nope', env: {} })).errors
        ).toEqual(['invalid-type ']);
    });
});

describe('semantic checks', () => {
    const run = (overrides, options = {}) =>
        summary(
            validateDefinition({
                definition: scaffold(overrides),
                env: {},
                ...options,
            })
        );

    describe('encryption', () => {
        it("requires AES_KEY_ID and AES_KEY in environment for 'aes'", () => {
            expect(
                run({ encryption: { fieldLevelEncryptionMethod: 'aes' } })
                    .errors
            ).toEqual([
                'missing-encryption-env /environment/AES_KEY_ID',
                'missing-encryption-env /environment/AES_KEY',
            ]);
        });

        it('warns when the AES values are missing from the deploying shell', () => {
            const result = run(
                {
                    encryption: { fieldLevelEncryptionMethod: 'aes' },
                    environment: {
                        DATABASE_URL: true,
                        AES_KEY_ID: true,
                        AES_KEY: true,
                    },
                },
                { stage: 'prod', env: { AES_KEY_ID: 'k1' } }
            );
            expect(result.errors).toEqual([]);
            expect(result.warnings).toContain(
                'missing-env-value /environment/AES_KEY'
            );
        });

        it('warns that a deployed stage without a method stores plaintext', () => {
            expect(
                run({ encryption: undefined }, { stage: 'prod' }).warnings
            ).toContain(
                'no-field-encryption /encryption/fieldLevelEncryptionMethod'
            );
        });

        it('warns that stage dev never encrypts', () => {
            expect(run({}, { stage: 'dev' }).warnings).toContain(
                'encryption-bypassed /encryption/fieldLevelEncryptionMethod'
            );
        });

        it('warns about the KMS key fallback outside managed mode', () => {
            expect(
                run({ managementMode: undefined, vpcIsolation: undefined })
                    .warnings
            ).toContain('kms-key-source /encryption/createResourceIfNoneFound');
        });
    });

    describe('user', () => {
        it('rejects a user config with which login always fails', () => {
            expect(
                run({ user: { individualUserRequired: false } }).errors
            ).toEqual(['no-login /user']);
        });

        it('warns an organization-only app that individualUserRequired now defaults to true', () => {
            expect(
                run({ user: { organizationUserRequired: true } }).warnings
            ).toContain('default-changed /user/individualUserRequired');
        });

        it('rejects adopterJwt without a secret and an app with every auth mode off', () => {
            expect(
                run({
                    user: {
                        authModes: {
                            friggToken: false,
                            sharedSecret: false,
                            adopterJwt: false,
                        },
                    },
                }).errors
            ).toEqual(['no-auth-mode /user/authModes']);
            expect(
                run({ user: { authModes: { adopterJwt: true } } }).errors
            ).toEqual(['missing-key /user/jwtConfig/secret']);
        });

        it('warns that user.password is the old spelling of usePassword', () => {
            expect(run({ user: { password: true } }).warnings).toContain(
                'deprecated-alias /user/password'
            );
        });
    });

    describe('management and VPC', () => {
        it("warns that 'managed' does not stop the VPC builder applying vpc.management", () => {
            expect(
                run({ vpc: { enable: true, management: 'discover' } }).warnings
            ).toContain('conflicting-settings /vpc/management');
        });

        it("warns when 'managed' is used without vpcIsolation", () => {
            expect(run({ vpcIsolation: undefined }).warnings).toContain(
                'ambiguous-default /vpcIsolation'
            );
        });

        it('warns about subnet and NAT values the VPC builder ignores', () => {
            const result = run({
                managementMode: undefined,
                vpc: {
                    enable: true,
                    subnets: { management: 'create-new' },
                    natGateway: { management: 'discover' },
                },
            });
            expect(result.warnings).toEqual(
                expect.arrayContaining([
                    'no-effect /vpc/subnets/management',
                    'no-effect /vpc/natGateway/management',
                ])
            );
        });

        it('requires the ids use-existing needs', () => {
            const result = run({
                managementMode: undefined,
                vpc: {
                    enable: true,
                    management: 'use-existing',
                    subnets: { management: 'use-existing' },
                },
                database: {
                    postgres: { enable: true, management: 'use-existing' },
                },
            });
            expect(result.errors).toEqual([
                'missing-key /vpc/vpcId',
                'missing-key /vpc/subnets/ids',
                'missing-key /database/postgres/endpoint',
            ]);
        });

        it('warns that a private Aurora cluster is unreachable from Lambdas outside a VPC', () => {
            expect(
                run({
                    managementMode: undefined,
                    database: {
                        postgres: { enable: true, management: 'managed' },
                    },
                }).warnings
            ).toContain('unreachable-database /vpc/enable');
        });
    });

    it('warns about keys nothing reads', () => {
        expect(
            run({ custom: { appName: 'x' }, security: { cors: {} } }).warnings
        ).toEqual(
            expect.arrayContaining(['no-effect /security', 'no-effect /custom'])
        );
    });

    it("warns that 'ssm' environment entries need ssm.enable", () => {
        expect(
            run({ environment: { DATABASE_URL: true, API_KEY: 'ssm' } })
                .warnings
        ).toContain('ssm-inactive /environment/API_KEY');
    });
});
