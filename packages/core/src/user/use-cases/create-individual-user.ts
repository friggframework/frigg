import { get } from '../../assertions';
import Boom from '@hapi/boom';
import { User } from '../user';
import type { UserRepositoryInterface } from '../repositories/user-repository-interface';

interface UserConfigForCreate {
    usePassword?: boolean;
    primary: string;
    individualUserRequired: boolean;
    organizationUserRequired: boolean;
}

interface CreateIndividualUserDeps {
    userRepository: UserRepositoryInterface;
    userConfig: UserConfigForCreate;
}

export class CreateIndividualUser {
    private userRepository: UserRepositoryInterface;
    private userConfig: UserConfigForCreate;

    constructor({ userRepository, userConfig }: CreateIndividualUserDeps) {
        this.userRepository = userRepository;
        this.userConfig = userConfig;
    }

    async execute(params: Record<string, unknown>): Promise<User> {
        let hashword: string | undefined;
        if (this.userConfig.usePassword) {
            hashword = get(params, 'password') as string;
        }

        const email = get(params, 'email', null) as string | null;
        const username = get(params, 'username', null) as string | null;
        if (!email && !username) {
            throw Boom.badRequest('email or username is required');
        }

        const appUserId = get(params, 'appUserId', null) as string | null;
        const organizationUserId = get(params, 'organizationUserId', null) as string | null;

        const individualUserData = await this.userRepository.createIndividualUser({
            email,
            username,
            hashword,
            appUserId,
            organizationUser: organizationUserId,
        });

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
