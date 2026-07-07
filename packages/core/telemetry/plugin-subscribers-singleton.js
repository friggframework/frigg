const { wireTelemetrySubscribers } = require('./plugin-subscribers');

/**
 * Process-wide wiring of adopter-declared telemetry subscribers (ADR-011
 * Decision 6). Built once per cold start and reused for the life of the Lambda
 * container, mirroring the usage-rollup singleton. Independent of the usage
 * rollup: adopter taps wire even when no integration declares `Definition.usage`.
 * Never throws — a bad/absent app definition just means no adopter taps.
 */
let wired = null;
let initialized = false;

function getPluginTelemetrySubscribers() {
    if (initialized) return wired;
    initialized = true;
    try {
        const {
            loadAppDefinition,
        } = require('../handlers/app-definition-loader');
        const { telemetry = {} } = loadAppDefinition();
        const subscribers = telemetry.subscribers || [];
        if (subscribers.length === 0) {
            wired = [];
            return wired;
        }

        const { getTelemetry } = require('./telemetry-singleton');
        wired = wireTelemetrySubscribers({
            telemetry: getTelemetry(),
            subscribers,
        });
    } catch (error) {
        console.warn(
            `[Frigg][telemetry] plugin subscribers disabled: ${
                error && error.message
            }`
        );
        wired = [];
    }
    return wired;
}

function resetPluginTelemetrySubscribersForTests() {
    wired = null;
    initialized = false;
}

module.exports = {
    getPluginTelemetrySubscribers,
    resetPluginTelemetrySubscribersForTests,
};
