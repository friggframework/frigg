const { listIntegrationClasses, resolveIntegrationClass, _resetShadowWarningsForTests } = require('../integration-types');
const { createMemorySink } = require('../../logs');

const code = (name) => class { static Definition = { name }; };
const host = (names) => class Host {
    static Definition = { name: 'host' };
    static IntegrationProvider = { resolve: async () => null, list: async () => names.map((n) => code(n)) };
};

describe('a published definition shadowed by registered code', () => {
    beforeEach(() => _resetShadowWarningsForTests());

    it('is ignored (code wins) and logged once as frigg.integrations.definition.shadowed_by_code', async () => {
        const sink = createMemorySink();
        const classes = [code('clash'), host(['clash', 'fine'])];
        const first = await listIntegrationClasses(classes);
        await listIntegrationClasses(classes);
        expect(first.map((c) => c.Definition.name).sort()).toEqual(['clash', 'fine']);
        expect(first.find((c) => c.Definition.name === 'clash')).toBe(classes[0]);
        const warns = sink.records.filter((r) => r.eventName === 'frigg.integrations.definition.shadowed_by_code');
        expect(warns).toHaveLength(1);
        expect(warns[0]).toMatchObject({ level: 'WARN', integrationName: 'clash', logger: 'frigg.integrations' });
    });

    it('says nothing when no name clashes', async () => {
        const sink = createMemorySink();
        await listIntegrationClasses([code('a'), host(['b'])]);
        expect(sink.records.filter((r) => String(r.eventName).includes('shadowed'))).toHaveLength(0);
    });

    it('still resolves to the code class', async () => {
        const classes = [code('clash'), host(['clash'])];
        expect(await resolveIntegrationClass(classes, 'clash')).toBe(classes[0]);
    });
});
