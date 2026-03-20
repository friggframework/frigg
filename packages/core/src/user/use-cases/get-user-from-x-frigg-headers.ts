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

    private async validateOrgLinkage(
        individualUserData: any,
        organizationUserData: any
    ): Promise<any> {
        const individualOrgId = individualUserData.organizationUser?.toString();
        const expectedOrgId = organizationUserData.id?.toString();

        if (individualOrgId === expectedOrgId) return individualUserData;

        if (this.userConfig.strictUserValidation) {
            throw Boom.badRequest(
                'User ID mismatch: x-frigg-appUserId and x-frigg-appOrgId refer to different users. ' +
                'Provide only one identifier or ensure they belong to the same user.'
            );
        }

        return this.userRepository.linkIndividualToOrganization(
            individualUserData.id!,
            organizationUserData.id!
        );
    }

    private async ensureIndividualUser(appUserId: string, individualUserData: any): Promise<any> {
        if (individualUserData) return individualUserData;

        return this.userRepository.createIndividualUser({
            appUserId,
            username: `app-user-${appUserId}`,
            email: `${appUserId}@app.local`,
        });
    }

    private async ensureOrganizationUser(
        appOrgId: string,
        organizationUserData: any,
        individualUserData: any
    ): Promise<{ individualUserData: any; organizationUserData: any }> {
        if (organizationUserData) return { individualUserData, organizationUserData };

        organizationUserData = await this.userRepository.createOrganizationUser({ appOrgId });

        if (individualUserData) {
            individualUserData = await this.userRepository.linkIndividualToOrganization(
                individualUserData.id!,
                organizationUserData.id!
            );
        }

        return { individualUserData, organizationUserData };
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
            individualUserData = await this.validateOrgLinkage(individualUserData, organizationUserData);
        }

        if (appUserId && this.userConfig.individualUserRequired !== false) {
            individualUserData = await this.ensureIndividualUser(appUserId, individualUserData);
        }

        if (appOrgId && this.userConfig.organizationUserRequired) {
            const result = await this.ensureOrganizationUser(appOrgId, organizationUserData, individualUserData);
            individualUserData = result.individualUserData;
            organizationUserData = result.organizationUserData;
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
