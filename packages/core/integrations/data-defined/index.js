/**
 * Data-defined integrations, v0.1 (ADR-063). An integration as a document: modules, syncs, workflows, queries,
 * UI surfaces and templates, run by one runtime class on the existing Frigg infrastructure.
 */
const fs = require('fs');
const path = require('path');
const { validate } = require('./validate');
const { compile, routeWebhook, eventName } = require('./compile');
const { execute } = require('./interpreter');
const { makePorts, runWorkflow, runQuery, renderSurface, resolveView, runLifecycle, resolveOptions } = require('./runtime');
const { diff, checkBump, planUpgrade } = require('./versioning');
const { defineIntegrationClass, defineSharedIntegrationClass, extendIntegrationClass, memoryDefinitions } = require('./data-defined-integration');
const { BUILTINS } = require('./steps');
const { TRANSFORMS, applyMapping } = require('./transforms');
const { FILTERS } = require('./expressions');
const { validateManifest } = require('./manifests');
const { checkDefinition, checkManifest, checkInstallation } = require('./schema-check');
const { viewToSlack, escapeMrkdwn } = require('./renderers/slack');
const { viewToHubSpot } = require('./renderers/hubspot');
const { viewToHtml, slackMessageToHtml } = require('./renderers/html');
const { previewSurface, previewWorkflow, recordingPorts } = require('./renderers/preview');
const { decodeAction } = require('./renderers/common');
const useCases = require('./use-cases/definition-use-cases');

/** Load every capabilities/*.capabilities.json (bundled mocks; real modules ship their own). */
function loadManifests(dir = path.join(__dirname, 'capabilities')) {
    const out = {};
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.capabilities.json')) { const m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); out[m.module] = m; }
    return out;
}
function loadExamples(dir = path.join(__dirname, 'examples')) {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.definition.json')).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

module.exports = {
    SCHEMA_VERSION: '0.1',
    validate, validateManifest, checkDefinition, checkManifest, checkInstallation, compile, routeWebhook, eventName, execute,
    makePorts, runWorkflow, runQuery, renderSurface, resolveView, runLifecycle,
    diff, checkBump, planUpgrade,
    defineIntegrationClass, defineSharedIntegrationClass, extendIntegrationClass, memoryDefinitions,
    BUILTINS, TRANSFORMS, FILTERS, applyMapping, resolveOptions,
    loadManifests, loadExamples,
    viewToSlack, escapeMrkdwn, viewToHubSpot, viewToHtml, slackMessageToHtml, previewSurface, previewWorkflow, recordingPorts, decodeAction,
    ...useCases,
};
