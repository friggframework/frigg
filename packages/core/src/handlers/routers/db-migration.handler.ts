/**
 * Database Migration Router Lambda Handler
 *
 * Minimal Lambda wrapper that avoids loading core/index.js
 */
import serverlessHttp from 'serverless-http';
import express from 'express';
import type { Request, Response } from 'express';
import cors from 'cors';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const dbMigrationRouter = require('./db-migration');

// Create minimal Express app
const app = express();
app.use(cors());
app.use(express.json());
app.use(dbMigrationRouter.router || dbMigrationRouter);

// Error handler
app.use((err: any, _req: Request, res: Response, _next: any) => {
    console.error('Error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
});

// Export as .handler property (Lambda config: db-migration.handler)
export const handler = serverlessHttp(app);

