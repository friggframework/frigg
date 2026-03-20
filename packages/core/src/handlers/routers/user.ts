import express from 'express';
import type { Request, Response } from 'express';
import { createAppHandler } from '../app-handler-helpers';
import { loadAppDefinition } from '../app-definition-loader';
import catchAsyncError from 'express-async-handler';

// JS modules not yet converted
/* eslint-disable @typescript-eslint/no-var-requires */
const { checkRequiredParams } = require('../../integrations/integration-router');
const { createUserRepository } = require('../../user/repositories/user-repository-factory');
const { CreateIndividualUser } = require('../../user/use-cases/create-individual-user');
const { LoginUser } = require('../../user/use-cases/login-user');
const { CreateTokenForUserId } = require('../../user/use-cases/create-token-for-user-id');
/* eslint-enable @typescript-eslint/no-var-requires */

const router = express();
const { userConfig } = loadAppDefinition();
const userRepository = createUserRepository();
const createIndividualUser = new CreateIndividualUser({
    userRepository,
    userConfig,
});
const loginUser = new LoginUser({
    userRepository,
    userConfig,
});
const createTokenForUserId = new CreateTokenForUserId({ userRepository });

// define the login endpoint
router.route('/user/login').post(
    catchAsyncError(async (req: Request, res: Response) => {
        const { username, password } = checkRequiredParams(req.body, [
            'username',
            'password',
        ]);
        const user = await loginUser.execute({ username, password });
        const token = await createTokenForUserId.execute(user.getId(), 120);
        res.status(201);
        res.json({ token });
    })
);

router.route('/user/create').post(
    catchAsyncError(async (req: Request, res: Response) => {
        const { username, password } = checkRequiredParams(req.body, [
            'username',
            'password',
        ]);

        const user = await createIndividualUser.execute({
            username,
            password,
        });
        const token = await createTokenForUserId.execute(user.getId(), 120);
        res.status(201);
        res.json({ token });
    })
);

const handler = createAppHandler('HTTP Event: User', router);

export { handler, router };

