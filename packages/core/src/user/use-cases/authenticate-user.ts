import Boom from '@hapi/boom';
import type { User } from '../user';
import type { GetUserFromBearerToken } from './get-user-from-bearer-token';
import type { GetUserFromXFriggHeaders } from './get-user-from-x-frigg-headers';
import type { GetUserFromAdopterJwt } from './get-user-from-adopter-jwt';
import type { AuthenticateWithSharedSecret } from './authenticate-with-shared-secret';

interface AuthModes {
    sharedSecret?: boolean;
    adopterJwt?: boolean;
    friggToken?: boolean;
}

interface UserConfigForAuth {
    authModes?: AuthModes;
}

interface AuthenticateUserDeps {
    getUserFromBearerToken: GetUserFromBearerToken;
    getUserFromXFriggHeaders: GetUserFromXFriggHeaders;
    getUserFromAdopterJwt: GetUserFromAdopterJwt;
    authenticateWithSharedSecret: AuthenticateWithSharedSecret;
    userConfig: UserConfigForAuth;
}

interface AuthRequest {
    headers: Record<string, string | undefined>;
}

export class AuthenticateUser {
    private readonly getUserFromBearerToken: GetUserFromBearerToken;
    private readonly getUserFromXFriggHeaders: GetUserFromXFriggHeaders;
    private readonly getUserFromAdopterJwt: GetUserFromAdopterJwt;
    private readonly authenticateWithSharedSecret: AuthenticateWithSharedSecret;
    private readonly userConfig: UserConfigForAuth;

    constructor({
        getUserFromBearerToken,
        getUserFromXFriggHeaders,
        getUserFromAdopterJwt,
        authenticateWithSharedSecret,
        userConfig,
    }: AuthenticateUserDeps) {
        this.getUserFromBearerToken = getUserFromBearerToken;
        this.getUserFromXFriggHeaders = getUserFromXFriggHeaders;
        this.getUserFromAdopterJwt = getUserFromAdopterJwt;
        this.authenticateWithSharedSecret = authenticateWithSharedSecret;
        this.userConfig = userConfig;
    }

    async execute(req: AuthRequest): Promise<User> {
        const authModes = this.userConfig.authModes || { friggToken: true };
        const appUserId = req.headers['x-frigg-appuserid'];
        const appOrgId = req.headers['x-frigg-apporgid'];
        let user: User | null = null;

        // Priority 1: Shared Secret (backend-to-backend with API key)
        if (authModes.sharedSecret !== false) {
            const apiKey = req.headers['x-frigg-api-key'];
            if (apiKey) {
                await this.authenticateWithSharedSecret.execute(apiKey);
                return await this.getUserFromXFriggHeaders.execute(appUserId, appOrgId);
            }
        }

        // Priority 2: Adopter JWT (if enabled)
        if (authModes.adopterJwt === true && req.headers.authorization?.startsWith('Bearer ')) {
            const token = req.headers.authorization.split(' ')[1];
            if (token && token.split('.').length === 3) {
                user = await this.getUserFromAdopterJwt.execute(token);
                if (appUserId || appOrgId) {
                    this.validateUserMatch(user, appUserId, appOrgId);
                }
                return user;
            }
        }

        // Priority 3: Frigg native token (default)
        if (authModes.friggToken !== false && req.headers.authorization) {
            user = await this.getUserFromBearerToken.execute(req.headers.authorization);
            if (appUserId || appOrgId) {
                this.validateUserMatch(user, appUserId, appOrgId);
            }
            return user;
        }

        throw Boom.unauthorized('No valid authentication provided');
    }

    validateUserMatch(user: User, appUserId?: string, appOrgId?: string): void {
        if (appUserId && user.getAppUserId() !== appUserId) {
            throw Boom.forbidden('x-frigg-appuserid header does not match authenticated user');
        }
        if (appOrgId && user.getAppOrgId() !== appOrgId) {
            throw Boom.forbidden('x-frigg-apporgid header does not match authenticated user');
        }
    }
}
