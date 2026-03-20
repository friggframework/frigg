import { createHandler } from '../core/create-handler';
import { flushDebugLog } from '../logs';
import express from 'express';
import type { Application, Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import Boom from '@hapi/boom';
import serverlessHttp from 'serverless-http';

export type MiddlewareApplier = (app: Application) => void;

export const createApp = (applyMiddleware?: MiddlewareApplier): Application => {
    const app = express();

    app.use(bodyParser.json({ limit: '10mb' }));
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(
        cors({
            origin: '*',
            allowedHeaders: '*',
            methods: '*',
            credentials: true,
        })
    );

    if (applyMiddleware) applyMiddleware(app);

    // Handle sending error response and logging server errors to console
    app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
        const boomError: Boom.Boom = err.isBoom ? err : Boom.badImplementation(err);
        const {
            output: { statusCode = 500 },
        } = boomError;

        if (statusCode >= 500) {
            flushDebugLog(boomError);
            res.status(statusCode).json({ error: 'Internal Server Error' });
        } else {
            const safeMethod = String(req.method).replace(/[^\w]/g, '');
            const safePath = String(req.path).substring(0, 200).replace(/[\r\n]/g, '');
            console.warn(`[Frigg] ${safeMethod} ${safePath} -> ${statusCode}`);
            res.status(statusCode).json({ error: err.message });
        }
    });

    return app;
};

export function createAppHandler(
    eventName: string,
    router: express.Router | Application,
    shouldUseDatabase = true
): (event: any, context: any) => Promise<any> {
    const app = createApp((a) => {
        a.use(router);
    });
    return createHandler({
        eventName,
        method: serverlessHttp(app) as any,
    });
}

