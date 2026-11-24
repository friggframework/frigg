/**
 * Frigg Backend Server (canary harness).
 * Minimal Express server for manual poking; the FRI-498 test runs via `npm test`.
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
    console.log(`🚀 Frigg Canary Test Server running at http://localhost:${PORT}`);
    console.log(`   Integrations: ${integrations.map((I) => I.Definition?.name).join(', ')}`);
});
