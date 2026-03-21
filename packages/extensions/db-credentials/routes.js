/**
 * Admin API routes for managing OAuth app credentials in the database.
 *
 * Routes are mounted behind admin auth middleware by the extension system.
 *
 * @param {Object} prisma - Prisma client instance
 * @returns {import('express').Router}
 */
const express = require('express');

function createRouter(prisma) {
    const router = express.Router();

    // List all stored credentials (client_secret is redacted)
    router.get('/', async (_req, res) => {
        try {
            const records = await prisma.oAuthAppCredential.findMany({
                orderBy: { moduleName: 'asc' },
            });

            const redacted = records.map((r) => ({
                id: r.id,
                moduleName: r.moduleName,
                clientId: r.clientId,
                clientSecret: '***',
                extra: r.extra,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
            }));

            res.json(redacted);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get a single credential by moduleName
    router.get('/:moduleName', async (req, res) => {
        try {
            const record = await prisma.oAuthAppCredential.findUnique({
                where: { moduleName: req.params.moduleName },
            });

            if (!record) {
                return res.status(404).json({ error: 'Not found' });
            }

            res.json({
                id: record.id,
                moduleName: record.moduleName,
                clientId: record.clientId,
                clientSecret: '***',
                extra: record.extra,
                createdAt: record.createdAt,
                updatedAt: record.updatedAt,
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Create or update a credential (upsert by moduleName)
    router.put('/:moduleName', async (req, res) => {
        try {
            const { moduleName } = req.params;
            const { clientId, clientSecret, extra } = req.body;

            if (!clientId || !clientSecret) {
                return res.status(400).json({
                    error: 'clientId and clientSecret are required',
                });
            }

            const record = await prisma.oAuthAppCredential.upsert({
                where: { moduleName },
                create: {
                    moduleName,
                    clientId,
                    clientSecret,
                    extra: extra || {},
                },
                update: {
                    clientId,
                    clientSecret,
                    ...(extra !== undefined ? { extra } : {}),
                },
            });

            res.json({
                id: record.id,
                moduleName: record.moduleName,
                clientId: record.clientId,
                clientSecret: '***',
                extra: record.extra,
                createdAt: record.createdAt,
                updatedAt: record.updatedAt,
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Delete a credential
    router.delete('/:moduleName', async (req, res) => {
        try {
            await prisma.oAuthAppCredential.delete({
                where: { moduleName: req.params.moduleName },
            });
            res.status(204).end();
        } catch (error) {
            if (error.code === 'P2025') {
                return res.status(404).json({ error: 'Not found' });
            }
            res.status(500).json({ error: error.message });
        }
    });

    return router;
}

module.exports = createRouter;
