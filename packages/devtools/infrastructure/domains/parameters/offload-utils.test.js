const {
    getOffloadedKeys,
    getParameterPrefix,
    isSsmOffloadActive,
    validateOffloadConfig,
    FRAMEWORK_ENV_BLOCKLIST,
} = require('./offload-utils');

describe('offload-utils', () => {
    const originalSkipDiscovery = process.env.FRIGG_SKIP_AWS_DISCOVERY;

    afterEach(() => {
        if (originalSkipDiscovery === undefined) {
            delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
        } else {
            process.env.FRIGG_SKIP_AWS_DISCOVERY = originalSkipDiscovery;
        }
    });

    describe('getOffloadedKeys', () => {
        it('returns empty array when nothing is marked', () => {
            expect(getOffloadedKeys({})).toEqual([]);
            expect(
                getOffloadedKeys({ environment: { MY_VAR: true } })
            ).toEqual([]);
        });

        it("collects environment keys marked 'ssm'", () => {
            const keys = getOffloadedKeys({
                environment: { B_VAR: 'ssm', A_VAR: 'ssm', PLAIN: true },
            });
            expect(keys).toEqual(['A_VAR', 'B_VAR']);
        });

        it('collects ssm.parameters keys', () => {
            const keys = getOffloadedKeys({
                ssm: {
                    enable: true,
                    parameters: { MY_SECRET: { type: 'SecureString' } },
                },
            });
            expect(keys).toEqual(['MY_SECRET']);
        });

        it('unions and dedupes both sources, sorted', () => {
            const keys = getOffloadedKeys({
                environment: { SHARED: 'ssm', ENV_ONLY: 'ssm' },
                ssm: {
                    enable: true,
                    parameters: {
                        SHARED: { type: 'SecureString' },
                        PARAM_ONLY: { type: 'String' },
                    },
                },
            });
            expect(keys).toEqual(['ENV_ONLY', 'PARAM_ONLY', 'SHARED']);
        });
    });

    describe('getParameterPrefix', () => {
        it('defaults to the frigg-scoped serverless-variable path', () => {
            expect(getParameterPrefix({})).toBe(
                '/frigg/${self:service}/${self:provider.stage}'
            );
        });

        it('honors ssm.parameterPrefix override', () => {
            expect(
                getParameterPrefix({ ssm: { parameterPrefix: '/custom/x' } })
            ).toBe('/custom/x');
        });

        it('strips a trailing slash from the override', () => {
            expect(
                getParameterPrefix({ ssm: { parameterPrefix: '/custom/x/' } })
            ).toBe('/custom/x');
        });
    });

    describe('isSsmOffloadActive', () => {
        const offloadApp = {
            ssm: { enable: true },
            environment: { MY_SECRET: 'ssm' },
        };

        it('is true when ssm enabled and offload set non-empty', () => {
            delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
            expect(isSsmOffloadActive(offloadApp)).toBe(true);
        });

        it('is false without ssm.enable', () => {
            delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
            expect(
                isSsmOffloadActive({ environment: { MY_SECRET: 'ssm' } })
            ).toBe(false);
        });

        it('is false when nothing is offloaded', () => {
            delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
            expect(isSsmOffloadActive({ ssm: { enable: true } })).toBe(false);
        });

        it('is false in local mode (FRIGG_SKIP_AWS_DISCOVERY)', () => {
            process.env.FRIGG_SKIP_AWS_DISCOVERY = 'true';
            expect(isSsmOffloadActive(offloadApp)).toBe(false);
        });
    });

    describe('validateOffloadConfig', () => {
        it('passes for a clean offload config', () => {
            const { errors } = validateOffloadConfig({
                ssm: { enable: true },
                environment: { MY_SECRET: 'ssm' },
            });
            expect(errors).toEqual([]);
        });

        it('errors when offload markers exist without ssm.enable', () => {
            const { errors } = validateOffloadConfig({
                environment: { MY_SECRET: 'ssm' },
            });
            expect(errors.join(' ')).toMatch(/ssm\.enable/);
        });

        it('errors on framework-managed (blocklisted) keys', () => {
            const { errors } = validateOffloadConfig({
                ssm: { enable: true },
                environment: { DATABASE_URL: 'ssm' },
            });
            expect(errors.join(' ')).toMatch(/DATABASE_URL/);
        });

        it('errors on keys that are not valid env var names', () => {
            const { errors } = validateOffloadConfig({
                ssm: {
                    enable: true,
                    parameters: { 'api-keys/foo': { type: 'String' } },
                },
            });
            expect(errors.join(' ')).toMatch(/api-keys\/foo/);
        });
    });

    it('blocklist covers the framework-managed keys', () => {
        for (const key of [
            'STAGE',
            'FRIGG_STACK',
            'KMS_KEY_ARN',
            'DATABASE_URL',
            'DATABASE_SECRET_ARN',
            'SECRET_ARN',
            'SSM_PARAMETER_PREFIX',
            'FRIGG_SSM_OFFLOADED_KEYS',
            'AWS_REGION',
        ]) {
            expect(FRAMEWORK_ENV_BLOCKLIST.has(key)).toBe(true);
        }
    });
});
