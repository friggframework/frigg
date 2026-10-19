const { validateIntegrationDefinition } = require('../index');

const definition = (schedule) => ({
    name: 'sync',
    version: '1.0.0',
    modules: { crm: { definition: { moduleName: 'hubspot' } } },
    schedule,
});

describe('integration definition: schedule', () => {
    it.each([{}, { scope: 'class' }, { scope: 'installation' }, { scope: 'installation', isDue: 'fn' }])(
        'accepts %j',
        (schedule) => {
            expect(validateIntegrationDefinition(definition(schedule)).valid).toBe(true);
        }
    );

    it.each([{ scope: 'installations' }, { scope: 'per-installation' }, { scope: 1 }, { scop: 'class' }])(
        'rejects %j',
        (schedule) => {
            expect(validateIntegrationDefinition(definition(schedule)).valid).toBe(false);
        }
    );
});
