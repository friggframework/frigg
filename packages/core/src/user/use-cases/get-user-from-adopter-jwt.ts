import Boom from '@hapi/boom';
import type { User } from '../user';
import type { UserRepositoryInterface } from '../repositories/user-repository-interface';

interface UserConfigForJwt {
    usePassword?: boolean;
    primary: string;
    individualUserRequired: boolean;
    organizationUserRequired: boolean;
    jwtConfig?: {
        secret?: string;
        algorithm?: string;
        userIdClaim?: string;
        orgIdClaim?: string;
    };
}

interface GetUserFromAdopterJwtDeps {
    userRepository: UserRepositoryInterface;
    userConfig: UserConfigForJwt;
}

export class GetUserFromAdopterJwt {
    private userRepository: UserRepositoryInterface;
    private userConfig: UserConfigForJwt;

    constructor({ userRepository, userConfig }: GetUserFromAdopterJwtDeps) {
        this.userRepository = userRepository;
        this.userConfig = userConfig;
    }

    async execute(_jwtToken: string): Promise<User> {
        throw Boom.notImplemented(
            'Adopter JWT authentication is not yet implemented. ' +
            'This feature is planned for a future Frigg release. ' +
            'Please use one of the supported authentication modes instead: ' +
            'friggToken (native bearer token) or xFriggHeaders (backend-to-backend with x-frigg-appUserId/appOrgId headers).'
        );
    }
}
