import type { UserData } from '../user';

export interface SessionToken {
    id?: string;
    token: string;
    expires?: Date | null;
    userId?: string;
    user?: string;
    [key: string]: unknown;
}

export interface CreateIndividualUserParams {
    email?: string | null;
    username?: string | null;
    hashword?: string;
    appUserId?: string | null;
    organization?: string | null;
    organizationId?: string | null;
    organizationUser?: string | null;
    [key: string]: unknown;
}

export interface CreateOrganizationUserParams {
    appOrgId?: string | null;
    name?: string | null;
    [key: string]: unknown;
}

export class UserRepositoryInterface {
    async getSessionToken(_token: string): Promise<SessionToken> {
        throw new Error(
            'Method getSessionToken must be implemented by subclass'
        );
    }

    async findOrganizationUserById(_userId: string): Promise<UserData | null> {
        throw new Error(
            'Method findOrganizationUserById must be implemented by subclass'
        );
    }

    async findIndividualUserById(_userId: string): Promise<UserData | null> {
        throw new Error(
            'Method findIndividualUserById must be implemented by subclass'
        );
    }

    async createToken(_userId: string, _rawToken: string, _minutes = 120): Promise<string> {
        throw new Error('Method createToken must be implemented by subclass');
    }

    async createIndividualUser(_params: CreateIndividualUserParams): Promise<UserData> {
        throw new Error(
            'Method createIndividualUser must be implemented by subclass'
        );
    }

    async createOrganizationUser(_params: CreateOrganizationUserParams): Promise<UserData> {
        throw new Error(
            'Method createOrganizationUser must be implemented by subclass'
        );
    }

    async findIndividualUserByUsername(_username: string): Promise<UserData | null> {
        throw new Error(
            'Method findIndividualUserByUsername must be implemented by subclass'
        );
    }

    async findIndividualUserByAppUserId(_appUserId: string): Promise<UserData | null> {
        throw new Error(
            'Method findIndividualUserByAppUserId must be implemented by subclass'
        );
    }

    async findOrganizationUserByAppOrgId(_appOrgId: string): Promise<UserData | null> {
        throw new Error(
            'Method findOrganizationUserByAppOrgId must be implemented by subclass'
        );
    }

    async findIndividualUserByEmail(_email: string): Promise<UserData | null> {
        throw new Error(
            'Method findIndividualUserByEmail must be implemented by subclass'
        );
    }

    async updateIndividualUser(_userId: string, _updates: Partial<UserData>): Promise<UserData> {
        throw new Error(
            'Method updateIndividualUser must be implemented by subclass'
        );
    }

    async updateOrganizationUser(_userId: string, _updates: Partial<UserData>): Promise<UserData> {
        throw new Error(
            'Method updateOrganizationUser must be implemented by subclass'
        );
    }

    async deleteUser(_userId: string): Promise<boolean> {
        throw new Error('Method deleteUser must be implemented by subclass');
    }

    async linkIndividualToOrganization(_individualUserId: string, _organizationUserId: string): Promise<UserData> {
        throw new Error(
            'Method linkIndividualToOrganization must be implemented by subclass'
        );
    }
}
