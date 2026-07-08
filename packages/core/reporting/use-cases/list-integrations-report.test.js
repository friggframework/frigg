const { ListIntegrationsReport } = require('./list-integrations-report');

const makeRepo = (rows, mappingCounts = new Map()) => ({
    findIntegrationsForReport: jest.fn().mockResolvedValue(rows),
    countMappingsByIntegrationIds: jest.fn().mockResolvedValue(mappingCounts),
});

describe('ListIntegrationsReport — usage columns (ADR-011/ADR-010 hand-off)', () => {
    const rows = [
        { id: '1', type: 'hubspot', status: 'ENABLED', userId: 'u1' },
        { id: '2', type: 'salesforce', status: 'ENABLED', userId: 'u2' },
    ];

    it('enriches byType with usage columns read from the usage store', async () => {
        const reportingRepository = makeRepo(rows);
        const usageRepository = {
            getTotalsByDimension: jest.fn(async ({ metric }) => {
                if (metric === 'records.synced') {
                    return [{ integrationType: 'hubspot', value: 42 }];
                }
                return [];
            }),
        };
        const useCase = new ListIntegrationsReport({
            reportingRepository,
            usageRepository,
        });

        const result = await useCase.execute();

        const hubspot = result.metrics.byType.find((t) => t.type === 'hubspot');
        const salesforce = result.metrics.byType.find(
            (t) => t.type === 'salesforce'
        );
        expect(hubspot.usage['records.synced']).toBe(42);
        // absent usage reads as 0, not undefined
        expect(salesforce.usage['records.synced']).toBe(0);
        expect(hubspot.usage['webhooks.received']).toBe(0);
        expect(usageRepository.getTotalsByDimension).toHaveBeenCalledWith(
            expect.objectContaining({
                metric: 'records.synced',
                groupBy: 'integrationType',
            })
        );
    });

    it('omits usage columns entirely when no usageRepository is injected (backward compatible)', async () => {
        const useCase = new ListIntegrationsReport({
            reportingRepository: makeRepo(rows),
        });
        const result = await useCase.execute();
        expect(result.metrics.byType[0].usage).toBeUndefined();
        expect(result.schemaVersion).toBe(1);
    });

    it('never lets a usage-store failure break the structural report', async () => {
        const usageRepository = {
            getTotalsByDimension: jest.fn().mockRejectedValue(new Error('usage db down')),
        };
        const useCase = new ListIntegrationsReport({
            reportingRepository: makeRepo(rows),
            usageRepository,
        });

        const result = await useCase.execute();
        expect(result.metrics.total).toBe(2);
        // structural report intact; usage simply absent/empty
    });
});

describe('ListIntegrationsReport', () => {
    it('requires a reportingRepository', () => {
        expect(() => new ListIntegrationsReport({})).toThrow(
            /reportingRepository is required/
        );
    });

    it('rejects an unknown status with a 400 (Boom) error', async () => {
        const repo = makeRepo([]);
        const useCase = new ListIntegrationsReport({
            reportingRepository: repo,
        });
        await expect(
            useCase.execute({ status: 'BOGUS' })
        ).rejects.toMatchObject({
            isBoom: true,
            output: { statusCode: 400 },
        });
        expect(repo.findIntegrationsForReport).not.toHaveBeenCalled();
    });

    it('rejects a non-string query param with a 400 (Boom) error', async () => {
        const repo = makeRepo([]);
        const useCase = new ListIntegrationsReport({
            reportingRepository: repo,
        });
        await expect(
            useCase.execute({ userId: { $oid: 'x' } })
        ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 400 } });
        expect(repo.findIntegrationsForReport).not.toHaveBeenCalled();
    });

    it('builds the versioned envelope with totals, byStatus, byType and per-row counts', async () => {
        const rows = [
            {
                id: '1',
                type: 'hubspot',
                status: 'ENABLED',
                userId: '3',
                version: '1.0.0',
                moduleCount: 2,
                errorCount: 0,
                createdAt: new Date('2026-01-01T00:00:00Z'),
                updatedAt: new Date('2026-01-02T00:00:00Z'),
            },
            {
                id: '2',
                type: 'hubspot',
                status: 'ERROR',
                userId: '3',
                version: '1.0.0',
                moduleCount: 1,
                errorCount: 3,
            },
            {
                id: '3',
                type: 'salesforce',
                status: 'ENABLED',
                userId: '4',
                version: '2.0.0',
                moduleCount: 1,
                errorCount: 0,
            },
        ];
        const counts = new Map([
            ['1', 412],
            ['2', 5],
        ]);
        const useCase = new ListIntegrationsReport({
            reportingRepository: makeRepo(rows, counts),
        });

        const out = await useCase.execute({});

        expect(out.schemaVersion).toBe(1);
        expect(out.service).toBe('frigg-core-api');
        expect(typeof out.generatedAt).toBe('string');
        expect(out.metrics.total).toBe(3);
        expect(out.metrics.byStatus).toEqual({
            ENABLED: 2,
            ERROR: 1,
            NEEDS_CONFIG: 0,
            PROCESSING: 0,
            IN_CREATION: 0,
            IN_DELETION: 0,
            DISABLED: 0,
        });

        const hub = out.metrics.byType.find((t) => t.type === 'hubspot');
        expect(hub.total).toBe(2);
        expect(hub.byStatus).toEqual({
            ENABLED: 1,
            ERROR: 1,
            NEEDS_CONFIG: 0,
            PROCESSING: 0,
            IN_CREATION: 0,
            IN_DELETION: 0,
            DISABLED: 0,
        });

        const row1 = out.metrics.integrations.find((i) => i.id === '1');
        expect(row1.mappedRecordCount).toBe(412);
        expect(row1.moduleCount).toBe(2);
        expect(row1.createdAt).toBe('2026-01-01T00:00:00.000Z');

        const row3 = out.metrics.integrations.find((i) => i.id === '3');
        expect(row3.mappedRecordCount).toBe(0);
        expect(row3.createdAt).toBeNull();
    });

    it('filters by type in the use-case and only counts mappings for matching ids', async () => {
        const rows = [
            {
                id: '1',
                type: 'hubspot',
                status: 'ENABLED',
                moduleCount: 1,
                errorCount: 0,
            },
            {
                id: '2',
                type: 'salesforce',
                status: 'ENABLED',
                moduleCount: 1,
                errorCount: 0,
            },
        ];
        const repo = makeRepo(rows, new Map([['1', 10]]));
        const useCase = new ListIntegrationsReport({
            reportingRepository: repo,
        });

        const out = await useCase.execute({ type: 'hubspot' });

        expect(out.metrics.total).toBe(1);
        expect(out.metrics.integrations[0].id).toBe('1');
        expect(repo.countMappingsByIntegrationIds).toHaveBeenCalledWith(['1']);
        expect(out.filters.type).toBe('hubspot');
    });

    it('passes status/userId to the repository, echoes filters, and skips mapping count when empty', async () => {
        const repo = makeRepo([]);
        const useCase = new ListIntegrationsReport({
            reportingRepository: repo,
        });

        const out = await useCase.execute({ status: 'ERROR', userId: '7' });

        expect(repo.findIntegrationsForReport).toHaveBeenCalledWith({
            status: 'ERROR',
            userId: '7',
        });
        expect(out.metrics.total).toBe(0);
        expect(out.filters).toEqual({
            status: 'ERROR',
            type: null,
            userId: '7',
        });
        expect(repo.countMappingsByIntegrationIds).not.toHaveBeenCalled();
    });

    it('buckets null type as "unknown"', async () => {
        const rows = [
            {
                id: '1',
                type: null,
                status: 'ENABLED',
                moduleCount: 0,
                errorCount: 0,
            },
        ];
        const useCase = new ListIntegrationsReport({
            reportingRepository: makeRepo(rows),
        });

        const out = await useCase.execute({});

        expect(out.metrics.integrations[0].type).toBe('unknown');
        expect(out.metrics.byType[0].type).toBe('unknown');
    });

    it('picks up an unknown status value dynamically (new enum member)', async () => {
        const rows = [
            {
                id: '1',
                type: 'x',
                status: 'ARCHIVED',
                moduleCount: 0,
                errorCount: 0,
            },
        ];
        const useCase = new ListIntegrationsReport({
            reportingRepository: makeRepo(rows),
        });

        const out = await useCase.execute({});

        expect(out.metrics.byStatus.ARCHIVED).toBe(1);
        expect(out.metrics.byStatus.ENABLED).toBe(0);
    });

    it('buckets a missing status under UNKNOWN, never a literal "null" key', async () => {
        const rows = [
            { id: '1', type: 'x', status: null, moduleCount: 0, errorCount: 0 },
        ];
        const useCase = new ListIntegrationsReport({
            reportingRepository: makeRepo(rows),
        });

        const out = await useCase.execute({});

        expect(out.metrics.byStatus.UNKNOWN).toBe(1);
        expect(out.metrics.byStatus).not.toHaveProperty('null');
        expect(out.metrics.byType[0].byStatus.UNKNOWN).toBe(1);
        expect(out.metrics.byType[0].byStatus).not.toHaveProperty('null');
    });

    it('asserts byType buckets are independent across types', async () => {
        const rows = [
            {
                id: '1',
                type: 'hubspot',
                status: 'ENABLED',
                moduleCount: 1,
                errorCount: 0,
            },
            {
                id: '2',
                type: 'salesforce',
                status: 'ERROR',
                moduleCount: 1,
                errorCount: 1,
            },
        ];
        const out = await new ListIntegrationsReport({
            reportingRepository: makeRepo(rows),
        }).execute({});

        expect(out.metrics.byType).toHaveLength(2);
        const sf = out.metrics.byType.find((t) => t.type === 'salesforce');
        expect(sf.total).toBe(1);
        expect(sf.byStatus).toEqual({
            ENABLED: 0,
            ERROR: 1,
            NEEDS_CONFIG: 0,
            PROCESSING: 0,
            IN_CREATION: 0,
            IN_DELETION: 0,
            DISABLED: 0,
        });
    });

    it('normalizes timestamps from Date, extended-JSON {$date}, string, and null', async () => {
        const rows = [
            {
                id: '1',
                type: 'x',
                status: 'ENABLED',
                moduleCount: 0,
                errorCount: 0,
                createdAt: { $date: '2026-03-04T05:06:07Z' },
                updatedAt: { $date: 'not-a-date' },
            },
            {
                id: '2',
                type: 'x',
                status: 'ENABLED',
                moduleCount: 0,
                errorCount: 0,
                createdAt: '2026-03-04T05:06:07.000Z',
                updatedAt: null,
            },
        ];
        const out = await new ListIntegrationsReport({
            reportingRepository: makeRepo(rows),
        }).execute({});

        const r1 = out.metrics.integrations.find((i) => i.id === '1');
        expect(r1.createdAt).toBe('2026-03-04T05:06:07.000Z');
        expect(r1.updatedAt).toBeNull();
        const r2 = out.metrics.integrations.find((i) => i.id === '2');
        expect(r2.createdAt).toBe('2026-03-04T05:06:07.000Z');
        expect(r2.updatedAt).toBeNull();
    });

    it('labels byType buckets from the typeLabels map and exposes the map', async () => {
        const rows = [
            {
                id: '1',
                type: 'hubspot',
                status: 'ENABLED',
                moduleCount: 1,
                errorCount: 0,
            },
            {
                id: '2',
                type: 'salesforce',
                status: 'ENABLED',
                moduleCount: 1,
                errorCount: 0,
            },
        ];
        const typeLabels = { hubspot: 'HubSpot CRM', salesforce: 'Salesforce' };
        const useCase = new ListIntegrationsReport({
            reportingRepository: makeRepo(rows),
            typeLabels,
        });

        const out = await useCase.execute({});

        const hub = out.metrics.byType.find((t) => t.type === 'hubspot');
        expect(hub.label).toBe('HubSpot CRM');
        const sf = out.metrics.byType.find((t) => t.type === 'salesforce');
        expect(sf.label).toBe('Salesforce');
        expect(out.metrics.typeLabels).toEqual(typeLabels);
    });

    it('falls back to the slug when a type has no label, and defaults typeLabels to {}', async () => {
        const rows = [
            {
                id: '1',
                type: 'hubspot',
                status: 'ENABLED',
                moduleCount: 1,
                errorCount: 0,
            },
            {
                id: '2',
                type: null,
                status: 'ENABLED',
                moduleCount: 0,
                errorCount: 0,
            },
        ];
        const useCase = new ListIntegrationsReport({
            reportingRepository: makeRepo(rows),
        });

        const out = await useCase.execute({});

        const hub = out.metrics.byType.find((t) => t.type === 'hubspot');
        expect(hub.label).toBe('hubspot');
        const unknown = out.metrics.byType.find((t) => t.type === 'unknown');
        expect(unknown.label).toBe('unknown');
        expect(out.metrics.typeLabels).toEqual({});
    });
});
