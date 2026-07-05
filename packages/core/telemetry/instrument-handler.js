/**
 * Wraps a single integration handler invocation with a span + the
 * `frigg.handler.invocations` counter (ADR-011 Decision 2). Shared by the two
 * dispatch seams — `IntegrationBase.send()` and `IntegrationEventDispatcher` —
 * so both paths are instrumented identically.
 *
 * Cardinality discipline: the metric is keyed by the **bounded event type**
 * (USER_ACTION / CRON / QUEUE / WEBHOOK / LIFE_CYCLE_EVENT), never the specific
 * event/action name. High-cardinality ids (integrationId, userId) ride span
 * baggage via `telemetry.withContext`, never metric attributes. The full event
 * name is kept on the span only.
 *
 * @param {object|null} telemetry Telemetry service (no-op-safe; null → just runs fn).
 * @param {object} context Standard identifiers from `getTelemetryContext()`.
 * @param {{event: string, eventType: string}} descriptor Event name + bounded type.
 * @param {Function} fn The handler invocation.
 */
async function instrumentHandler(telemetry, context = {}, descriptor = {}, fn) {
    if (!telemetry || typeof telemetry.span !== 'function') {
        return fn();
    }

    const integrationType = context.integrationType || 'unknown';
    const eventType = descriptor.eventType || 'unknown';
    const eventName = descriptor.event;

    const runInstrumented = () =>
        telemetry.span(`frigg.handler.${eventType}`, async (span) => {
            if (span && typeof span.setAttributes === 'function') {
                span.setAttributes({
                    integration_type: integrationType,
                    event: eventType,
                    event_name: eventName,
                });
            }
            // `event_name` (potentially high-cardinality action id) rides the
            // bus-only context — used by North Star derived-from-trace matching,
            // never a metric label.
            const busContext = { event_name: eventName };
            try {
                const result = await fn();
                telemetry.count(
                    'frigg.handler.invocations',
                    1,
                    {
                        integration_type: integrationType,
                        event: eventType,
                        status: 'ok',
                    },
                    busContext
                );
                return result;
            } catch (err) {
                telemetry.count(
                    'frigg.handler.invocations',
                    1,
                    {
                        integration_type: integrationType,
                        event: eventType,
                        status: 'error',
                    },
                    busContext
                );
                throw err;
            }
        });

    if (typeof telemetry.withContext === 'function') {
        return telemetry.withContext(
            {
                integrationId: context.integrationId,
                userId: context.userId,
                integrationType: context.integrationType,
                version: context.version,
            },
            runInstrumented
        );
    }
    return runInstrumented();
}

module.exports = { instrumentHandler };
