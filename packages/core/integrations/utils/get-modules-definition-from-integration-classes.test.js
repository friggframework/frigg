/**
 * getModulesDefinitionFromIntegrationClasses is kept as a deprecated wrapper
 * over the entity type registry (ADR-059 §2), so adopters that import it keep
 * working.
 */
const core = require('../../index');
const integrationsIndex = require('../index');
const {
    getModulesDefinitionFromIntegrationClasses,
} = require('./map-integration-dto');
const {
    getEntityTypeRegistry,
    getEntityTypeDefinitions,
    EntityRegistryError,
} = require('../../modules/entity-type-registry');
const { createMemorySink } = require('../../logs');

const def = (moduleName, extra = {}) => ({ moduleName, ...extra });
const integration = (name, modules) => ({
    Definition: {
        name,
        modules: Object.fromEntries(
            Object.entries(modules).map(([key, definition]) => [
                key,
                { definition },
            ])
        ),
    },
});

const hubspot = def('hubspot');
const slack = def('slack');
const google = def('google');

describe('getModulesDefinitionFromIntegrationClasses (deprecated wrapper)', () => {
    it('is still exported from @friggframework/core and integrations/', () => {
        expect(core.getModulesDefinitionFromIntegrationClasses).toBe(
            getModulesDefinitionFromIntegrationClasses
        );
        expect(
            integrationsIndex.getModulesDefinitionFromIntegrationClasses
        ).toBe(getModulesDefinitionFromIntegrationClasses);
    });

    it('returns each bound definition once, as before', () => {
        const integrations = [
            integration('a', { crm: hubspot, chat: slack }),
            integration('b', { crm: hubspot }),
        ];
        expect(getModulesDefinitionFromIntegrationClasses(integrations)).toEqual(
            [hubspot, slack]
        );
    });

    it('returns exactly the registry definitions for the same integrations', () => {
        const first = def('crm', { marker: 'first' });
        const second = def('crm', { marker: 'second' });
        const integrations = [
            integration('a', { crm: first, chat: slack }),
            integration('b', { crm: second }),
        ];
        const viaWrapper =
            getModulesDefinitionFromIntegrationClasses(integrations);
        expect(viaWrapper).toEqual(
            getEntityTypeDefinitions(getEntityTypeRegistry({ integrations }))
        );
        // One definition per entity type name: the first wins, as the
        // registry (and ModuleFactory) pick it.
        expect(viaWrapper).toEqual([first, slack]);
    });

    it('includes registry-only types when the app entities are passed', () => {
        const definitions = getModulesDefinitionFromIntegrationClasses(
            [integration('a', { crm: hubspot })],
            { google: { definition: google } }
        );
        expect(definitions).toEqual([google, hubspot]);
    });

    it('applies the registry conflict rule when entities are passed', () => {
        expect(() =>
            getModulesDefinitionFromIntegrationClasses(
                [integration('a', { crm: def('hubspot', { other: true }) })],
                { hubspot: { definition: hubspot } }
            )
        ).toThrow(EntityRegistryError);
    });

    it('logs a deprecation warning once per process', () => {
        jest.isolateModules(() => {
            const sink = createMemorySink();
            const fresh = require('./map-integration-dto');
            fresh.getModulesDefinitionFromIntegrationClasses([]);
            fresh.getModulesDefinitionFromIntegrationClasses([]);
            const warnings = sink.records.filter(
                (r) =>
                    r.eventName ===
                    'frigg.integrations.deprecated_module_definitions'
            );
            expect(warnings).toEqual([
                expect.objectContaining({ level: 'WARN' }),
            ]);
        });
    });
});
