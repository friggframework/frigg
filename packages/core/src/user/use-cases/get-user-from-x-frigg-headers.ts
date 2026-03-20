import Boom from '@hapi/boom';
import { User } from '../user';
import type { UserRepositoryInterface } from '../repositories/user-repository-interface';

interface UserConfigForXFriggHeaders {
    usePassword?: boolean;
    primary: string;
    individualUserRequired: boolean;
    organizationUserRequired: boolean;
    strictUserValidation?: boolean;
}

interface GetUserFromXFriggHeadersDeps {
    userRepository: UserRepositoryInterface;
    userConfig: UserConfigForXFriggHeaders;
}

export class GetUserFromXFriggHeaders {
    private readonly userRepository: UserRepositoryInterface;
    private readonly userConfig: UserConfigForXFriggHeaders;

    constructor({ userRepository, userConfig }: GetUserFromXFriggHeadersDeps) {
        this.userRepository = userRepository;
        this.userConfig = userConfig;
    }

    async execute(appUserId?: string, appOrgId?: string): Promise<User> {
        if (!appUserId && !appOrgId) {
            throw Boom.badRequest(
                'At least one of x-frigg-appUserId or x-frigg-appOrgId headers is required for backend-to-backend authentication'
            );
        }

        let individualUserData = null;
        let organizationUserData = null;

        if (appUserId && this.userConfig.individualUserRequired !== false) {
            individualUserData = await this.userRepository.findIndividualUserByAppUserId(appUserId);
        }

        if (appOrgId && this.userConfig.organizationUserRequired) {
            organizationUserData = await this.userRepository.findOrganizationUserByAppOrgId(appOrgId);
        }

        if (appUserId && appOrgId && individualUserData && organizationUserData) {
            const individualOrgId = individualUserData.organizationUser?.toString();
            const expectedOrgId = organizationUserData.id?.toString();

            if (individualOrgId !== expectedOrgId) {
                if (this.userConfig.strictUserValidation) {
                    throw Boom.badRequest(
                        'User ID mismatch: x-frigg-appUserId and x-frigg-appOrgId refer to different users. ' +
                        'Provide only one identifier or ensure they belong to the same user.'
                    );
                }

                individualUserData = await this.userRepository.linkIndividualToOrganization(
                    individualUserData.id!,
                    organizationUserData.id!
                );
            }
        }

        if (!individualUserData && appUserId && this.userConfig.individualUserRequired !== false) {
            individualUserData = await this.userRepository.createIndividualUser({
                appUserId,
                username: `app-user-${appUserId}`,
                email: `${appUserId}@app.local`,
            });
        }

        if (!organizationUserData && appOrgId && this.userConfig.organizationUserRequired) {
            organizationUserData = await this.userRepository.createOrganizationUser({
                appOrgId,
            });

            if (individualUserData && organizationUserData) {
                individualUserData = await this.userRepository.linkIndividualToOrganization(
                    individualUserData.id!,
                    organizationUserData.id!
                );
            }
        }

        return new User(
            individualUserData,
            organizationUserData,
            this.userConfig.usePassword,
            this.userConfig.primary,
            this.userConfig.individualUserRequired,
            this.userConfig.organizationUserRequired
        );
    }
}
