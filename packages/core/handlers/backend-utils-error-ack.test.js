const { checkIntegrationRunnable } = require('./backend-utils');

/**
 * ADR-031, the silent-ack companion to option 4.
 *
 * The queue worker used to silently ack every message for an integration in
 * DISABLED, ERROR, or IN_DELETION. For ERROR that ack is the amplifier that
 * turned one lost auth race into months of silent data loss: SQS deleted the
 * work with no DLQ entry. ERROR must now reject the message so SQS retries
 * and eventually DLQs. DISABLED and IN_DELETION are intentional stops and
 * keep the ack. FRIGG_LEGACY_ERROR_ACK=true is the kill switch.
 */
describe('checkIntegrationRunnable (ADR-031 silent-ack fix)', () => {
    const label = '[test] Integration int-1';

    afterEach(() => {
        delete process.env.FRIGG_LEGACY_ERROR_ACK;
    });

    it('throws for ERROR so SQS retries instead of silently dropping work', () => {
        expect(() => checkIntegrationRunnable('ERROR', label)).toThrow(
            /ERROR/
        );
    });

    it('keeps the legacy silent ack for ERROR when the kill switch is set', () => {
        process.env.FRIGG_LEGACY_ERROR_ACK = 'true';

        expect(checkIntegrationRunnable('ERROR', label)).toBe(false);
    });

    it('keeps the silent ack for DISABLED — an intentional operator stop', () => {
        expect(checkIntegrationRunnable('DISABLED', label)).toBe(false);
    });

    it('keeps the silent ack for IN_DELETION — a deletion in flight', () => {
        expect(checkIntegrationRunnable('IN_DELETION', label)).toBe(false);
    });

    it('lets every runnable status proceed', () => {
        expect(checkIntegrationRunnable('ENABLED', label)).toBe(true);
        expect(checkIntegrationRunnable('NEEDS_CONFIG', label)).toBe(true);
        expect(checkIntegrationRunnable(undefined, label)).toBe(true);
    });
});
