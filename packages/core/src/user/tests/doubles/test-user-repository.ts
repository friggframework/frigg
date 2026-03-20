export class TestUserRepository {
    individualUsers: Map<string, any>;
    organizationUsers: Map<string, any>;
    tokens: Map<string, any>;
    userConfig: any;

    constructor({ userConfig }: { userConfig: any }) {
        this.individualUsers = new Map();
        this.organizationUsers = new Map();
        this.tokens = new Map();
        this.userConfig = userConfig;
    }

    async getSessionToken(token: string) {
        return this.tokens.get(token);
    }

    async findOrganizationUserById(userId: string) {
        return this.organizationUsers.get(userId);
    }

    async findIndividualUserById(userId: string) {
        return this.individualUsers.get(userId);
    }

    async createToken(userId: string, rawToken?: string, minutes = 120) {
        const token = `token-for-${userId}-for-${minutes}-mins`;
        this.tokens.set(token, { user: userId, rawToken });
        return token;
    }

    async createIndividualUser(params: any) {
        const individualUserData = { id: `individual-${Date.now()}`, ...params };
        this.individualUsers.set(individualUserData.id, individualUserData);
        return individualUserData;
    }

    async createOrganizationUser(params: any) {
        const orgUserData = { ...params, id: `org-${Date.now()}` };
        this.organizationUsers.set(orgUserData.id, orgUserData);
        return orgUserData;
    }

    async findIndividualUserByUsername(username: string) {
        for (const userDoc of this.individualUsers.values()) {
            if (userDoc.username === username) {
                return userDoc;
            }
        }
        return null;
    }

    async findIndividualUserByAppUserId(appUserId: string) {
        if (!appUserId) return null;
        for (const userDoc of this.individualUsers.values()) {
            if (userDoc.appUserId === appUserId) {
                return userDoc;
            }
        }
        return null;
    }

    async findOrganizationUserByAppOrgId(appOrgId: string) {
        if (!appOrgId) return null;
        for (const userDoc of this.organizationUsers.values()) {
            if (userDoc.appOrgId === appOrgId) {
                return userDoc;
            }
        }
        return null;
    }
}
