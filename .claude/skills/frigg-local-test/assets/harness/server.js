/**
 * Minimal Express server for the harness.
 *
 * Lets agents (or curl) poke the app definition over HTTP without the full
 * osls-offline stack: health check + integration listing. The full Frigg
 * Management API (user/create, /api/authorize, /api/integrations, ...) is
 * exercised via the real app path (`frigg start` -> osls offline) — see the
 * frigg-local-test skill.
 */
require('dotenv').config();

const express = require('express');
const { Definition } = require('./index');

const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const { integrations } = Definition;

app.get('/api/integrations', (req, res) => {
    const list = integrations.map((I) => ({
        name: I.Definition?.name,
        version: I.Definition?.version,
        // Single source of truth: the framework only reads Definition.modules.
        modules: Object.keys(I.Definition?.modules || {}),
    }));
    res.json(list);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🚀 Frigg Test Harness server running at http://localhost:${PORT}`);
    console.log(`   Integrations: ${integrations.map((I) => I.Definition?.name).join(', ')}`);
    console.log(`   DB_TYPE: ${process.env.DB_TYPE || 'postgresql'}`);
});
