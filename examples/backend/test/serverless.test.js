const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const waitOn = require('wait-on');
const { expect } = require('chai');

const promiseToExec = promisify(exec);

describe.skip('Serverless', function () {
    this.timeout(15_000);

    // This works locally but not in CI.
    it('starts (in offline mode)', async () => {
        const serverlessOffline = exec('npm run start:dev');

        try {
            await waitOn({
                resources: ['http://localhost:3001/'],
                timeout: 14_500,
                // Just check for a connection,even if it is 4xx or 5xx, so we know the server can start up OK.
                validateStatus: (status) => status >= 200,
            });
        } finally {
            // First, ask nicely to end the process.
            if (serverlessOffline.kill('SIGTERM')) {
                return;
            }

            // Force the process to end.
            if (serverlessOffline.kill('SIGKILL')) {
                return;
            }

            throw new Error('Could not kill serverless offline process.');
        }
    });
});
