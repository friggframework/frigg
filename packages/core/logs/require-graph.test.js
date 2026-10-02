const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CORE_DIR = path.join(__dirname, '..');

const cacheReport = (pattern) => `
    const loaded = Object.keys(require.cache).filter((k) => ${pattern}.test(k));
    process.stderr.write(loaded.length ? 'DIRTY:' + loaded.join(',') : 'CLEAN');
`;

function runProbe(script, env = {}) {
    const result = spawnSync(process.execPath, ['-e', script], {
        cwd: CORE_DIR,
        encoding: 'utf8',
        env: { PATH: process.env.PATH, ...env },
    });
    if (result.status !== 0) throw new Error(`probe failed: ${result.stderr}`);
    return result;
}

describe('logs require graph (ADR-048 §14 guards)', () => {
    it('loads no @opentelemetry, telemetry, handlers or node_modules path when writing a record', () => {
        const result = runProbe(`
            const logs = require('./logs');
            logs.getLogger('frigg.probe').info('one record', { eventName: 'frigg.probe.written' });
            logs.debug('shim %s', 'too');
            logs.flushDebugLog(new Error('x'));
            ${cacheReport('/@opentelemetry|\\/telemetry\\/|\\/handlers\\/|node_modules/')}
        `, { FRIGG_LOG_LEVEL: 'debug' });
        expect(result.stderr).toBe('CLEAN');
        const lines = result.stdout.split('\n').filter(Boolean);
        expect(lines.map((l) => JSON.parse(l).logger)).toEqual([
            'frigg.probe',
            'frigg.legacy',
            'frigg.legacy',
        ]);
    });

    it('never loads handlers/app-definition-loader', () => {
        const result = runProbe(`
            const logs = require('./logs');
            logs.initDebugLog('Event', { httpMethod: 'GET', path: '/x', headers: {} });
            logs.getLogger('integration.probe').error(new Error('x'));
            ${cacheReport('/app-definition-loader/')}
        `);
        expect(result.stderr).toBe('CLEAN');
    });

    it('requiring packages/core/index.js loads no @opentelemetry module', () => {
        const result = runProbe(
            `require('./index'); ${cacheReport('/@opentelemetry/')}`,
            { DB_TYPE: 'mongodb', STAGE: 'test' }
        );
        expect(result.stderr).toBe('CLEAN');
    });

    it('the barrel exports exactly the documented surface', () => {
        expect(Object.keys(require('./index')).sort()).toEqual([
            'createMemorySink',
            'debug',
            'flushDebugLog',
            'getLogger',
            'initDebugLog',
            'redactValue',
            'resetLoggerForTests',
            'serializeError',
            'toSanitizedSurrogate',
        ]);
    });

    it('the package root exports the logs surface', () => {
        const core = require('../index');
        for (const name of Object.keys(require('./index'))) {
            expect(core[name]).toBe(require('./index')[name]);
        }
    });
});
