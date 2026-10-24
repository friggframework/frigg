const {
    resolveNorthStarEntry,
    northStarKeys,
    createNorthStarDerivationSubscriber,
} = require('./north-star');
const { NoOpTelemetry } = require('./no-op-telemetry');

describe('resolveNorthStarEntry', () => {
    const northStar = {
        default: { name: 'records.synced' },
        byType: { crm: { name: 'contacts_synced' } },
    };

    it('prefers a byType entry over the default', () => {
        expect(resolveNorthStarEntry(northStar, 'crm').name).toBe(
            'contacts_synced'
        );
    });

    it('falls back to the default entry for an unlisted type', () => {
        expect(resolveNorthStarEntry(northStar, 'other').name).toBe(
            'records.synced'
        );
    });
});

describe('northStarKeys', () => {
    it('collects every referenced counter key', () => {
        const keys = northStarKeys({
            default: { name: 'a' },
            byType: { crm: { name: 'b' }, chat: { name: 'c' } },
        });
        expect([...keys].sort()).toEqual(['a', 'b', 'c']);
    });
});

describe('createNorthStarDerivationSubscriber', () => {
    function harness(northStar) {
        const telemetry = new NoOpTelemetry();
        const emitted = [];
        telemetry.on('metric', (m) => emitted.push(m));
        createNorthStarDerivationSubscriber({ telemetry, northStar });
        return { telemetry, emitted };
    }

    it('derives the North Star from a matching USER_ACTION', () => {
        const { telemetry, emitted } = harness({
            byType: {
                hubspot: {
                    name: 'leads_routed',
                    deriveFrom: { userAction: { action: 'route_lead' } },
                },
            },
        });

        telemetry.count(
            'frigg.handler.invocations',
            1,
            { integration_type: 'hubspot', event: 'USER_ACTION', status: 'ok' },
            { event_name: 'route_lead' }
        );

        expect(emitted.find((m) => m.name === 'leads_routed')).toBeDefined();
        expect(
            emitted.find((m) => m.name === 'leads_routed').attributes
                .integration_type
        ).toBe('hubspot');
    });

    it('does not derive for a non-matching action', () => {
        const { telemetry, emitted } = harness({
            byType: {
                hubspot: {
                    name: 'leads_routed',
                    deriveFrom: { userAction: { action: 'route_lead' } },
                },
            },
        });

        telemetry.count(
            'frigg.handler.invocations',
            1,
            { integration_type: 'hubspot', event: 'USER_ACTION', status: 'ok' },
            { event_name: 'something_else' }
        );

        expect(emitted.find((m) => m.name === 'leads_routed')).toBeUndefined();
    });

    it('derives from a matching apiRequest endpoint + method', () => {
        const { telemetry, emitted } = harness({
            byType: {
                hubspot: {
                    name: 'contacts_synced',
                    deriveFrom: {
                        apiRequest: { endpoint: '/contacts', method: 'POST' },
                    },
                },
            },
        });

        telemetry.count(
            'frigg.apimodule.requests',
            1,
            {
                module: 'hubspotApi',
                method: 'POST',
                integration_type: 'hubspot',
            },
            { url: 'https://api.hubapi.com/crm/v3/objects/contacts' }
        );

        expect(emitted.find((m) => m.name === 'contacts_synced')).toBeDefined();
    });

    it('does not loop on its own emission', () => {
        const { telemetry, emitted } = harness({
            byType: {
                hubspot: {
                    name: 'leads_routed',
                    deriveFrom: { userAction: { action: 'route_lead' } },
                },
            },
        });

        telemetry.count(
            'frigg.handler.invocations',
            1,
            { integration_type: 'hubspot', event: 'USER_ACTION', status: 'ok' },
            { event_name: 'route_lead' }
        );

        // exactly one derived emission, not a cascade
        expect(emitted.filter((m) => m.name === 'leads_routed')).toHaveLength(
            1
        );
    });
});
