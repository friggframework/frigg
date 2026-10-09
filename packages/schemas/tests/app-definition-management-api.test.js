const { validateAppDefinition } = require('../index');

const baseDefinition = {
    name: 'test-app',
    provider: 'aws',
    integrations: [],
};

const validate = (managementApi) =>
    validateAppDefinition({ ...baseDefinition, managementApi });

describe('app-definition schema: managementApi (ADR-052, ADR-053)', () => {
    it('accepts the v1 switch and the proxy block', () => {
        expect(
            validate({
                v1: false,
                proxy: {
                    enable: true,
                    timeoutMs: 10000,
                    maxRequestBytes: 65536,
                    maxResponseBytes: 1048576,
                    modules: {
                        hubspot: { allow: 'module' },
                        erp: {
                            allow: [{ method: 'GET', path: '/v1/customers/**' }],
                        },
                    },
                },
            }).valid
        ).toBe(true);
    });

    it('accepts an empty block', () => {
        expect(validate({}).valid).toBe(true);
    });

    it.each([
        [{ v1: 'no' }],
        [{ proxy: { enable: 'yes' } }],
        [{ proxy: { timeoutMs: 0 } }],
        [{ proxy: { timeoutMs: 60000 } }],
        [{ proxy: { maxResponseBytes: 10 * 1024 * 1024 } }],
        [{ proxy: { modules: { erp: { allow: 'everything' } } } }],
        [{ proxy: { modules: { erp: { allow: [{ method: 'TRACE', path: '/x' }] } } } }],
        [{ proxy: { modules: { erp: { allow: [{ method: 'GET', path: 'no-slash' }] } } } }],
        [{ unknown: true }],
    ])('rejects %j', (managementApi) => {
        expect(validate(managementApi).valid).toBe(false);
    });
});
