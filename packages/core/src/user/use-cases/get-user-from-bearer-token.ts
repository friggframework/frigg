import Boom from '@hapi/boom';
import { User } from '../user';
import type { UserRepositoryInterface } from '../repositories/user-repository-interface';

interface UserConfigForBearerToken {
    usePassword?: boolean;
    primary: string;
    individualUserRequired: boolean;
    organizationUserRequired: boolean;
}

interface GetUserFromBearerTokenDeps {
    userRepository: UserRepositoryInterface;
    userConfig: UserConfigForBearerToken;
}

export class GetUserFromBearerToken {
    private readonly userRepository: UserRepositoryInterface;
    private readonly userConfig: UserConfigForBearerToken;

    constructor({ userRepository, userConfig }: GetUserFromBearerTokenDeps) {
        this.userRepository = userRepository;
        this.userConfig = userConfig;
    }

    async execute(bearerToken: string): Promise<User> {
        if (!bearerToken) {
            throw Boom.unauthorized('Missing Authorization Header');
        }

        const token = bearerToken.split(' ')[1]?.trim();
        if (!token) {
            throw Boom.unauthorized('Invalid Token Format');
        }

        const sessionToken = await this.userRepository.getSessionToken(token);

        if (!sessionToken) {
            throw Boom.unauthorized('Session Token Not Found');
        }

        if (this.userConfig.primary === 'organization') {
            const organizationUserData = await this.userRepository.findOrganizationUserById(sessionToken.user!);

            if (!organizationUserData) {
                throw Boom.unauthorized('Organization User Not Found');
            }

            return new User(
                null,
                organizationUserData,
                this.userConfig.usePassword,
                this.userConfig.primary,
                this.userConfig.individualUserRequired,
                this.userConfig.organizationUserRequired
            );
        }

        const individualUserData = await this.userRepository.findIndividualUserById(sessionToken.user!);

        if (!individualUserData) {
            throw Boom.unauthorized('Individual User Not Found');
        }

        return new User(
            individualUserData,
            null,
            this.userConfig.usePassword,
            this.userConfig.primary,
            this.userConfig.individualUserRequired,
            this.userConfig.organizationUserRequired
        );
    }
}
