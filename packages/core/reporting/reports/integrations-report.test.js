const { IntegrationsReport, SCHEMA_VERSION } = require('./integrations-report');

// A fake admin command bundle — reports read only through this surface. Mirrors
// what the runner injects as `frigg` (context.commands) at runtime.
function makeFrigg({ rows = [], mappingCounts = new Map(), usage = [] } = {}) {
    return {
        integrations: { listForReport: jest.fn().mockResolvedValue(rows) },
        integrationMappings: {
            countByIntegrationIds: jest.fn().mockResolvedValue(mappingCounts),
        },
        usage: { getTotalsByDimension: jest.fn().mockResolvedValue(usage) },
    };
}

describe('IntegrationsReport (built-in)', () => {
    it('is a BUILTIN report named "integrations" with live as the default mode', () => {
        const def = IntegrationsReport.Definition;
        expect(def.name).toBe('integrations');
        expect(def.source).toBe('BUILTIN');
        expect(def.runModes[0]).toBe('live');
        expect(def.output.format).toBe('json');
    });

    it('builds the schemaVersion:1 shape: totals, byStatus, byType, mappedRecordCount', async () => {
        const rows = [
            {
                id: '1',
                type: 'attio',
                status: 'ENABLED',
                userId: 'u1',
                version: '1.0.0',
                moduleCount: 2,
                errorCount: 0,
                createdAt: new Date('2026-01-01T00:00:00Z'),
                updatedAt: new Date('2026-01-02T00:00:00Z'),
            },
            {
                id: '2',
                type: 'attio',
                status: 'ERROR',
                userId: 'u2',
                version: '1.0.0',
                moduleCount: 1,
                errorCount: 3,
                createdAt: new Date('2026-01-03T00:00:00Z'),
                updatedAt: new Date('2026-01-04T00:00:00Z'),
            },
        ];
        const frigg = makeFrigg({
            rows,
            mappingCounts: new Map([['1', 10]]),
        });

        const report = new IntegrationsReport();
        const result = await report.execute(frigg, {});

        expect(result.schemaVersion).toBe(SCHEMA_VERSION);
        expect(result.service).toBe('frigg-core-api');
        expect(result.metrics.total).toBe(2);
        expect(result.metrics.byStatus.ENABLED).toBe(1);
        expect(result.metrics.byStatus.ERROR).toBe(1);

        const attio = result.metrics.byType.find((b) => b.type === 'attio');
        expect(attio.total).toBe(2);
        expect(attio.byStatus.ENABLED).toBe(1);
        expect(attio.byStatus.ERROR).toBe(1);

        const first = result.metrics.integrations.find((i) => i.id === '1');
        expect(first.mappedRecordCount).toBe(10);
        expect(first.createdAt).toBe('2026-01-01T00:00:00.000Z');
        const second = result.metrics.integrations.find((i) => i.id === '2');
        expect(second.mappedRecordCount).toBe(0);

        // countByIntegrationIds is called only with the filtered ids
        expect(
            frigg.integrationMappings.countByIntegrationIds
        ).toHaveBeenCalledWith(['1', '2']);
    });

    it('filters by type in the report and echoes filters', async () => {
        const rows = [
            { id: '1', type: 'attio', status: 'ENABLED' },
            { id: '2', type: 'hubspot', status: 'ENABLED' },
        ];
        const frigg = makeFrigg({ rows, mappingCounts: new Map() });

        const report = new IntegrationsReport();
        const result = await report.execute(frigg, { type: 'attio' });

        expect(result.metrics.total).toBe(1);
        expect(result.metrics.integrations[0].type).toBe('attio');
        expect(result.filters).toEqual({
            status: null,
            type: 'attio',
            userId: null,
        });
    });

    it('attaches per-type usage columns from the usage command', async () => {
        const frigg = makeFrigg({
            rows: [{ id: '1', type: 'attio', status: 'ENABLED' }],
            usage: [{ integrationType: 'attio', value: 42 }],
        });

        const report = new IntegrationsReport();
        const result = await report.execute(frigg, {});

        const attio = result.metrics.byType.find((b) => b.type === 'attio');
        expect(attio.usage).toBeDefined();
        // every canonical counter uses the same mocked totals here
        expect(Object.values(attio.usage).every((v) => v === 42)).toBe(true);
    });

    it('still returns the report when the usage store is unavailable', async () => {
        const frigg = makeFrigg({
            rows: [{ id: '1', type: 'attio', status: 'ENABLED' }],
        });
        frigg.usage.getTotalsByDimension.mockRejectedValue(
            new Error('usage store down')
        );

        const report = new IntegrationsReport();
        const result = await report.execute(frigg, {});

        expect(result.metrics.total).toBe(1);
        const attio = result.metrics.byType.find((b) => b.type === 'attio');
        expect(attio.usage).toBeUndefined();
    });

    it('rejects an unknown status with an INVALID_INPUT error (no HTTP coupling)', async () => {
        const report = new IntegrationsReport();
        // The report is protocol-agnostic: it throws a coded error, not a Boom
        // HTTP error. The runner/router maps INVALID_INPUT to a 400.
        await expect(
            report.execute(makeFrigg(), { status: 'NOPE' })
        ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });
});
