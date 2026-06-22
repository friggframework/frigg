process.env.REPORTING_API_KEY = 'test-reporting-key';

jest.mock('./repositories/reporting-repository-factory', () => ({
    createReportingRepository: jest.fn(() => ({
        findIntegrationsForReport: jest.fn().mockResolvedValue([
            {
                id: '1',
                type: 'hubspot',
                status: 'ENABLED',
                userId: '3',
                version: '1',
                moduleCount: 1,
                errorCount: 0,
                createdAt: null,
                updatedAt: null,
            },
        ]),
        countMappingsByIntegrationIds: jest
            .fn()
            .mockResolvedValue(new Map([['1', 5]])),
    })),
}));

const { createReportingRouter, validateApiKey } = require('./reporting-router');

const mockRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

const findRouteHandler = (router, path) => {
    for (const layer of router.stack) {
        if (layer.route && layer.route.path === path) {
            const stack = layer.route.stack;
            return stack[stack.length - 1].handle;
        }
    }
    return null;
};

describe('reporting-router', () => {
    describe('validateApiKey', () => {
        it('returns 401 when the reporting key is missing', () => {
            const res = mockRes();
            const next = jest.fn();
            validateApiKey({ headers: {} }, res, next);
            expect(res.status).toHaveBeenCalledWith(401);
            expect(next).not.toHaveBeenCalled();
        });

        it('returns 401 when the reporting key is wrong', () => {
            const res = mockRes();
            const next = jest.fn();
            validateApiKey(
                { headers: { 'x-frigg-reporting-api-key': 'nope' } },
                res,
                next
            );
            expect(res.status).toHaveBeenCalledWith(401);
            expect(next).not.toHaveBeenCalled();
        });

        it('calls next when the reporting key matches', () => {
            const res = mockRes();
            const next = jest.fn();
            validateApiKey(
                { headers: { 'x-frigg-reporting-api-key': 'test-reporting-key' } },
                res,
                next
            );
            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });
    });

    describe('routes', () => {
        const router = createReportingRouter();

        it('GET /api/v2/reports returns the index', async () => {
            const handler = findRouteHandler(router, '/api/v2/reports');
            expect(handler).toBeTruthy();
            const res = mockRes();
            await handler({ query: {} }, res, jest.fn());
            expect(res.json).toHaveBeenCalledWith({
                service: 'frigg-core-api',
                reports: ['integrations'],
            });
        });

        it('GET /api/v2/reports/integrations returns the versioned envelope', async () => {
            const handler = findRouteHandler(
                router,
                '/api/v2/reports/integrations'
            );
            expect(handler).toBeTruthy();
            const res = mockRes();
            await handler({ query: {} }, res, jest.fn());
            expect(res.json).toHaveBeenCalled();
            const body = res.json.mock.calls[0][0];
            expect(body.schemaVersion).toBe(1);
            expect(body.metrics.total).toBe(1);
            expect(body.metrics.integrations[0].mappedRecordCount).toBe(5);
        });
    });
});
