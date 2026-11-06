const net = require('node:net');
const { TestMongo } = require('./mongodb');

// Opt-in DB test (`npm run test:db`): proves the pinned MongoDB binary
// downloads and starts on the CI image (Ubuntu 24.04 has no OpenSSL 1.1,
// which the old 5.0.x default needed).
describe('TestMongo', () => {
    const testMongo = new TestMongo();

    beforeAll(() => testMongo.start(), 120_000);
    afterAll(() => testMongo.stop());

    it('starts mongod and exports a reachable MONGO_URI', async () => {
        const { hostname, port } = new URL(process.env.MONGO_URI);

        await new Promise((resolve, reject) => {
            const socket = net.connect(Number(port), hostname, () => {
                socket.end();
                resolve();
            });
            socket.on('error', reject);
        });
    });
});
