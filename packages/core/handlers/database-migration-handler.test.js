const { handler } = require('./database-migration-handler');
const { createMemorySink } = require('../logs');
const { SECRETS } = require('../logs/__fixtures__/secrets');
const { findSecretWindow } = require('../logs/__fixtures__/matchers');

describe('database-migration-handler invocation log (ADR-048 Phase 2)', () => {
    it('logs the invocation without dumping the event', async () => {
        const sink = createMemorySink();
        const consoleSpies = ['log', 'warn', 'error'].map((method) =>
            jest.spyOn(console, method).mockImplementation()
        );
        const event = {
            command: 'not-a-command',
            migrationId: 'mig-1',
            DATABASE_URL: `postgresql://admin:${SECRETS.dbPassword}@db.internal/app`,
        };
        const context = { functionName: 'fn', functionVersion: '1' };

        try {
            await handler(event, context).catch(() => {});

            const [record] = sink.records.filter(
                (r) => r.eventName === 'frigg.database.migration.invoked'
            );
            expect(record).toMatchObject({
                level: 'INFO',
                migrationId: 'mig-1',
                action: 'not-a-command',
            });
            expect(sink.records).toContainNoSecretWindow(SECRETS);
            for (const spy of consoleSpies) {
                expect(findSecretWindow(spy.mock.calls, [SECRETS.dbPassword])).toBeNull();
            }
        } finally {
            consoleSpies.forEach((spy) => spy.mockRestore());
        }
    });
});
