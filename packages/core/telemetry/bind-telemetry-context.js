/**
 * Wrap a telemetry service so an integration instance's emissions automatically
 * carry its context — with no per-call boilerplate. Two channels are filled:
 *  - `integration_type` onto attributes (the one bounded, low-cardinality label);
 *  - the full identifier set onto the bus `context` arg (integrationId, userId,
 *    version, …), which the usage rollup and traces read.
 *
 * So integration code writes `this.telemetry.count('records.synced', n, { entity })`
 * or `this.telemetry.event('thing')` and both channels are populated. An
 * explicitly passed context still wins (e.g. a requester attaching a per-call
 * `url`), and high-cardinality ids ride the bus context only, never metric
 * labels (Cardinality note).
 *
 * @param {object} base The underlying telemetry service.
 * @param {() => object} getContext Lazy accessor for the instance's context.
 */
function bindTelemetryContext(base, getContext) {
    if (!base) return base;

    const readContext = () => {
        try {
            return (getContext && getContext()) || undefined;
        } catch (_) {
            return undefined;
        }
    };

    const withType = (attributes, ctx) => {
        const integrationType = ctx && ctx.integrationType;
        if (!integrationType || 'integration_type' in attributes) {
            return attributes;
        }
        return { integration_type: integrationType, ...attributes };
    };

    const resolveContext = (context, ctx) =>
        context !== undefined ? context : ctx;

    return {
        // Single source of truth for the instance context, so callers (e.g.
        // instrumentHandler) read it here instead of gathering it separately.
        getContext: () => readContext() || {},
        count(name, value = 1, attributes = {}, context) {
            const ctx = readContext();
            return base.count(
                name,
                value,
                withType(attributes, ctx),
                resolveContext(context, ctx)
            );
        },
        event(name, attributes = {}, context) {
            const ctx = readContext();
            return base.event(
                name,
                withType(attributes, ctx),
                resolveContext(context, ctx)
            );
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
