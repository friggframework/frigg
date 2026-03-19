import type { Request, Response } from 'express';
import { createAppHandler } from '../app-handler-helpers';

// createIntegrationRouter is still JS — use require
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createIntegrationRouter } = require('../../../integrations/integration-router');

const router = createIntegrationRouter() as import('express').Router;

router.route('/api/integrations/redirect/:appId').get((req: Request, res: Response) => {
    res.redirect(
        `${process.env.FRONTEND_URI}/redirect/${req.params.appId
        }?${new URLSearchParams(req.query as Record<string, string>)}`
    );
});

const handler = createAppHandler('HTTP Event: Auth', router);

export { handler };

