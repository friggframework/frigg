jest.mock('@friggframework/core', () => ({
    createHandler: ({ method }) => method,
}));

const mockRepository = {
    createConnection: jest.fn(),
    deleteConnection: jest.fn(),
};
// websocket.js requires this path, which does not exist (the factory lives
// in websocket/repositories/), so the mock must be virtual.
jest.mock(
    '../../database/websocket-connection-repository-factory',
    () => ({ createWebsocketConnectionRepository: () => mockRepository }),
    { virtual: true }
);

const { handler } = require('./websocket');
const { createMemorySink } = require('../../logs');
const { SECRETS } = require('../../logs/__fixtures__/secrets');

let sink;
let consoleSpies;

beforeEach(() => {
    sink = createMemorySink();
    consoleSpies = ['log', 'warn', 'error'].map((method) =>
        jest.spyOn(console, method).mockImplementation()
    );
    mockRepository.createConnection.mockReset();
    mockRepository.deleteConnection.mockReset();
});

afterEach(() => consoleSpies.forEach((spy) => spy.mockRestore()));

const expectNoConsole = () =>
    consoleSpies.forEach((spy) => expect(spy).not.toHaveBeenCalled());

const byEvent = (eventName) =>
    sink.records.filter((r) => r.eventName === eventName);

const event = (eventType, body) => ({
    requestContext: { eventType, connectionId: 'conn-1' },
    body,
});

describe('websocket handler logs (ADR-048 Phase 2)', () => {
    it('MESSAGE logs connectionId and bodyLength, never the body', async () => {
        const body = JSON.stringify({ token: SECRETS.accessToken });

        const result = await handler(event('MESSAGE', body));

        expect(result.statusCode).toBe(200);
        expect(byEvent('frigg.websocket.message_received')).toEqual([
            expect.objectContaining({
                level: 'INFO',
                connectionId: 'conn-1',
                bodyLength: body.length,
            }),
        ]);
        expect(sink.records).toContainNoSecretWindow(SECRETS);
        expectNoConsole();
    });

    it('CONNECT and DISCONNECT log INFO with the connectionId', async () => {
        await handler(event('CONNECT'));
        await handler(event('DISCONNECT'));

        expect(byEvent('frigg.websocket.connected')[0].connectionId).toBe('conn-1');
        expect(byEvent('frigg.websocket.disconnected')[0].connectionId).toBe(
            'conn-1'
        );
        expectNoConsole();
    });

    it('a failed store logs ERROR with the error and returns 500', async () => {
        mockRepository.createConnection.mockRejectedValue(
            new Error(`db down Bearer ${SECRETS.bearer}`)
        );
        mockRepository.deleteConnection.mockRejectedValue(new Error('db down'));

        expect((await handler(event('CONNECT'))).statusCode).toBe(500);
        expect((await handler(event('DISCONNECT'))).statusCode).toBe(500);

        expect(byEvent('frigg.websocket.connect_failed')[0].error.type).toBe('Error');
        expect(byEvent('frigg.websocket.disconnect_failed')).toHaveLength(1);
        expect(sink.records).toContainNoSecretWindow(SECRETS);
        expectNoConsole();
    });
});
