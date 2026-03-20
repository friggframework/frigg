import { get } from '../../assertions';
import { User } from '../user';
import type { UserRepositoryInterface } from '../repositories/user-repository-interface';

interface UserConfigForCreate {
    usePassword?: boolean;
    primary: string;
    individualUserRequired: boolean;
    organizationUserRequired: boolean;
}

interface CreateOrganizationUserDeps {
    userRepository: UserRepositoryInterface;
    userConfig: UserConfigForCreate;
}

export class CreateOrganizationUser {
    private userRepository: UserRepositoryInterface;
    private userConfig: UserConfigForCreate;

    constructor({ userRepository, userConfig }: CreateOrganizationUserDeps) {
        this.userRepository = userRepository;
        this.userConfig = userConfig;
    }

    async execute(params: Record<string, unknown>): Promise<User> {
        const name = get(params, 'name') as string;
        const appOrgId = get(params, 'appOrgId') as string;

        const organizationUserData = await this.userRepository.createOrganizationUser({
            name,
            appOrgId,
        });

        return new User(
            null,
            organizationUserData,
            this.userConfig.usePassword,
            this.userConfig.primary,
            this.userConfig.individualUserRequired,
            this.userConfig.organizationUserRequired
        );
    }
}
