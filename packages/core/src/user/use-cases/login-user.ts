import Boom from '@hapi/boom';
import { RequiredPropertyError } from '../../errors';
import { User } from '../user';
import type { UserRepositoryInterface } from '../repositories/user-repository-interface';

interface UserConfigForLogin {
    usePassword?: boolean;
    primary: string;
    individualUserRequired: boolean;
    organizationUserRequired: boolean;
}

interface LoginUserDeps {
    userRepository: UserRepositoryInterface;
    userConfig: UserConfigForLogin;
}

interface UserCredentials {
    username?: string;
    password?: string;
    appUserId?: string;
    appOrgId?: string;
}

export class LoginUser {
    private userRepository: UserRepositoryInterface;
    private userConfig: UserConfigForLogin;

    constructor({ userRepository, userConfig }: LoginUserDeps) {
        this.userRepository = userRepository;
        this.userConfig = userConfig;
    }

    async execute(userCredentials: UserCredentials): Promise<User> {
        const { username, password, appUserId, appOrgId } = userCredentials;

        if (this.userConfig.individualUserRequired) {
            if (this.userConfig.usePassword) {
                if (!username) {
                    throw new RequiredPropertyError({ parent: { name: 'LoginUser' }, key: 'username' });
                }
                if (!password) {
                    throw new RequiredPropertyError({ parent: { name: 'LoginUser' }, key: 'password' });
                }

                const individualUserData = await this.userRepository.findIndividualUserByUsername(username);

                if (!individualUserData) {
                    throw Boom.unauthorized('user not found');
                }

                const individualUser = new User(
                    individualUserData,
                    null,
                    this.userConfig.usePassword,
                    this.userConfig.primary,
                    this.userConfig.individualUserRequired,
                    this.userConfig.organizationUserRequired
                );

                if (!(await individualUser.isPasswordValid(password))) {
                    throw Boom.unauthorized('Incorrect username or password');
                }

                return individualUser;
            } else {
                const individualUserData = await this.userRepository.findIndividualUserByAppUserId(appUserId!);

                if (!individualUserData) {
                    throw Boom.unauthorized('user not found');
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

        if (this.userConfig.organizationUserRequired) {
            const organizationUserData = await this.userRepository.findOrganizationUserByAppOrgId(appOrgId!);

            if (!organizationUserData) {
                throw Boom.unauthorized(`org user ${appOrgId} not found`);
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

        throw new Error('User configuration must require either individualUserRequired or organizationUserRequired');
    }
}
