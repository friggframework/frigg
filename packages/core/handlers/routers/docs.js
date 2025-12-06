/**
 * API Documentation Router
 *
 * Serves dynamic OpenAPI spec and Scalar UI documentation.
 * Spec is generated dynamically based on appDefinition and installed modules.
 */

const { Router } = require('express');
const { createAppHandler } = require('./../app-handler-helpers');
const { generateOpenApiSpec } = require('../../openapi/openapi-spec-generator');

const router = Router();

let cachedAppDefinition = null;

/**
 * Load the appDefinition for spec generation
 * Lazy-loads and caches to avoid performance overhead
 */
function loadAppDefinitionForDocs() {
    if (cachedAppDefinition) return cachedAppDefinition;

    try {
        const { loadAppDefinition } = require('../app-definition-loader');
        const { integrations } = loadAppDefinition();
        cachedAppDefinition = { integrations };
        return cachedAppDefinition;
    } catch (error) {
        // App definition not available (e.g., in test environment)
        return null;
    }
}

/**
 * Get the dynamically generated OpenAPI spec
 */
function getOpenApiSpec(req) {
    const serverUrl = `${req.protocol}://${req.get('host')}`;
    const appDefinition = loadAppDefinitionForDocs();
    return generateOpenApiSpec(appDefinition, { serverUrl });
}

router.get('/api/openapi.json', (req, res) => {
    try {
        const spec = getOpenApiSpec(req);
        res.json(spec);
    } catch (error) {
        console.error('Failed to generate OpenAPI spec:', error.message);
        res.status(500).json({ error: 'Failed to load API specification' });
    }
});

router.get('/api/docs', (_req, res) => {
    const html = `<!DOCTYPE html>
<html>
<head>
    <title>Frigg API Documentation</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
        body { margin: 0; padding: 0; }
    </style>
</head>
<body>
    <script id="api-reference" data-url="/api/openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;
    res.type('html').send(html);
});

const handler = createAppHandler('HTTP Event: Docs', router, false);

module.exports = { handler, router };
