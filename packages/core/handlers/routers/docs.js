/**
 * API Documentation Router
 *
 * Serves dynamic OpenAPI specs and Scalar UI documentation for both v1 and v2 APIs.
 * Specs are generated dynamically based on appDefinition and installed modules.
 *
 * Endpoints:
 * - GET /api/docs - Main documentation UI with version selector
 * - GET /api/v1/docs - v1-specific documentation
 * - GET /api/v2/docs - v2-specific documentation
 * - GET /api/openapi.json - v2 spec (default/current)
 * - GET /api/openapi-v1.json - v1 spec
 * - GET /api/openapi-v2.json - v2 spec
 */

const { Router } = require('express');
const { createAppHandler } = require('./../app-handler-helpers');
const {
    generateOpenApiSpec,
    generateOpenApiSpecV1,
    generateOpenApiSpecV2,
} = require('../../openapi/openapi-spec-generator');

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
 * Generate Scalar HTML with version selector
 * @param {Object} options - Configuration options
 * @param {string} options.specUrl - Primary spec URL
 * @param {Array} options.sources - Array of spec sources for version selector
 * @param {string} options.title - Page title
 */
function generateScalarHtml({ specUrl, sources, title = 'Frigg API Documentation' }) {
    // If sources provided, use multi-spec configuration
    const config = sources
        ? { sources }
        : { url: specUrl };

    return `<!DOCTYPE html>
<html>
<head>
    <title>${title}</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
        body { margin: 0; padding: 0; }
    </style>
</head>
<body>
    <script id="api-reference" data-configuration='${JSON.stringify(config)}'></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;
}

// ============================================================================
// OpenAPI Spec Endpoints
// ============================================================================

/**
 * GET /api/openapi.json - Default (v2) OpenAPI spec
 */
router.get('/api/openapi.json', (req, res) => {
    try {
        const serverUrl = `${req.protocol}://${req.get('host')}`;
        const appDefinition = loadAppDefinitionForDocs();
        const spec = generateOpenApiSpecV2(appDefinition, { serverUrl });
        res.json(spec);
    } catch (error) {
        console.error('Failed to generate OpenAPI spec:', error.message);
        res.status(500).json({ error: 'Failed to load API specification' });
    }
});

/**
 * GET /api/openapi-v1.json - v1 API OpenAPI spec
 */
router.get('/api/openapi-v1.json', (req, res) => {
    try {
        const serverUrl = `${req.protocol}://${req.get('host')}`;
        const appDefinition = loadAppDefinitionForDocs();
        const spec = generateOpenApiSpecV1(appDefinition, { serverUrl });
        res.json(spec);
    } catch (error) {
        console.error('Failed to generate v1 OpenAPI spec:', error.message);
        res.status(500).json({ error: 'Failed to load API specification' });
    }
});

/**
 * GET /api/openapi-v2.json - v2 API OpenAPI spec
 */
router.get('/api/openapi-v2.json', (req, res) => {
    try {
        const serverUrl = `${req.protocol}://${req.get('host')}`;
        const appDefinition = loadAppDefinitionForDocs();
        const spec = generateOpenApiSpecV2(appDefinition, { serverUrl });
        res.json(spec);
    } catch (error) {
        console.error('Failed to generate v2 OpenAPI spec:', error.message);
        res.status(500).json({ error: 'Failed to load API specification' });
    }
});

// ============================================================================
// Documentation UI Endpoints
// ============================================================================

/**
 * GET /api/docs - Main documentation with version selector
 * Shows both v1 and v2 APIs with a dropdown to switch between them
 */
router.get('/api/docs', (_req, res) => {
    const html = generateScalarHtml({
        sources: [
            {
                title: 'API v2 (Current)',
                slug: 'v2',
                url: '/api/openapi-v2.json',
            },
            {
                title: 'API v1 (Legacy)',
                slug: 'v1',
                url: '/api/openapi-v1.json',
            },
        ],
        title: 'Frigg API Documentation',
    });
    res.type('html').send(html);
});

/**
 * GET /api/v1/docs - v1-specific documentation
 */
router.get('/api/v1/docs', (_req, res) => {
    const html = generateScalarHtml({
        specUrl: '/api/openapi-v1.json',
        title: 'Frigg API v1 Documentation',
    });
    res.type('html').send(html);
});

/**
 * GET /api/v2/docs - v2-specific documentation
 */
router.get('/api/v2/docs', (_req, res) => {
    const html = generateScalarHtml({
        specUrl: '/api/openapi-v2.json',
        title: 'Frigg API v2 Documentation',
    });
    res.type('html').send(html);
});

const handler = createAppHandler('HTTP Event: Docs', router, false);

module.exports = { handler, router };
