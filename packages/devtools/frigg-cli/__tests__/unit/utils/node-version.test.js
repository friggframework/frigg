const {
    SUPPORTED_NODE_RANGE,
    checkNodeVersion,
    enforceNodeVersion,
} = require('../../../utils/node-version');

describe('Node.js host version check (ADR-050)', () => {
    it('uses the engines.node range from package.json', () => {
        expect(SUPPORTED_NODE_RANGE).toBe(require('../../../package.json').engines.node);
        expect(SUPPORTED_NODE_RANGE).toBe('^22.13.0 || >=24');
    });

    it.each([
        ['22.13.0', true],
        ['v22.20.1', true],
        ['24.0.0', true],
        ['v24.10.0', true],
        ['25.1.0', true],
        ['22.12.0', false],
        ['v22.11.0', false],
        ['23.5.0', false],
        ['v23.11.1', false],
        ['20.19.0', false],
        ['18.20.0', false],
    ])('Node %s supported: %s', (version, supported) => {
        expect(checkNodeVersion(version).supported).toBe(supported);
    });

    it('explains the supported range and the fix when unsupported', () => {
        const { message } = checkNodeVersion('v23.5.0');
        expect(message).toContain('Node.js v23.5.0');
        expect(message).toContain('^22.13.0 || >=24');
        expect(message).toContain('Node 23');
        expect(message).toContain('FRIGG_SKIP_NODE_VERSION_CHECK');
    });

    it('prints the message and exits 1 on an unsupported host', () => {
        const log = jest.fn();
        const exit = jest.fn();
        const ok = enforceNodeVersion({ version: '23.5.0', env: {}, log, exit });
        expect(ok).toBe(false);
        expect(log).toHaveBeenCalledWith(expect.stringContaining('does not support Node.js'));
        expect(exit).toHaveBeenCalledWith(1);
    });

    it('continues silently on a supported host', () => {
        const log = jest.fn();
        const exit = jest.fn();
        expect(enforceNodeVersion({ version: '24.10.0', env: {}, log, exit })).toBe(true);
        expect(log).not.toHaveBeenCalled();
        expect(exit).not.toHaveBeenCalled();
    });

    it('can be bypassed with FRIGG_SKIP_NODE_VERSION_CHECK=true', () => {
        const exit = jest.fn();
        expect(
            enforceNodeVersion({
                version: '23.5.0',
                env: { FRIGG_SKIP_NODE_VERSION_CHECK: 'true' },
                log: jest.fn(),
                exit,
            })
        ).toBe(true);
        expect(exit).not.toHaveBeenCalled();
    });
});
