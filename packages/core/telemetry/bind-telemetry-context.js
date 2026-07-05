/**
 * Wrap a telemetry service so an integration instance's emissions automatically
 * carry its `integration_type` (ADR-011). This lets developers write
 * `this.telemetry.count('records.synced', n, { entity })` with no per-call
 * boilerplate, while the usage rollup still attributes the counter to the right
 * integration type.
 *
 * Only the bounded `integration_type` is injected onto attributes — high-
 * cardinality ids stay off metric labels (Cardinality note). All other methods
 * delegate unchanged.
 *
 * @param {object} base The underlying telemetry service.
 * @param {() => {integrationType?: string}} getContext Lazy context accessor.
 */
function bindTelemetryContext(base, getContext) {
    if (!base) return base;

    const withType = (attributes = {}) => {
        let integrationType;
        try {
            integrationType = getContext && getContext().integrationType;
        } catch (_) {
            integrationType = undefined;
        }
        if (!integrationType || 'integration_type' in attributes) {
            return attributes;
        }
        return { integration_type: integrationType, ...attributes };
    };

    return {
        count(name, value = 1, attributes = {}, context) {
            return base.count(name, value, withType(attributes), context);
        },
        event(name, attributes = {}, context) {
            return base.event(name, withType(attributes), context);
        },
        span: (...args) => base.span(...args),
        startSpan: (...args) => base.startSpan(...args),
        withContext: (...args) => base.withContext(...args),
        on: (...args) => base.on(...args),
        forceFlush: (...args) => base.forceFlush(...args),
        shutdown: (...args) =>
            typeof base.shutdown === 'function'
                ? base.shutdown(...args)
                : undefined,
        isEnabled: (...args) => base.isEnabled(...args),
    };
}

module.exports = { bindTelemetryContext };
