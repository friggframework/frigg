import bcrypt from 'bcryptjs';

export interface UserData {
    id?: string;
    type?: string;
    email?: string | null;
    username?: string | null;
    hashword?: string | null;
    appUserId?: string | null;
    organizationId?: string | null;
    appOrgId?: string | null;
    name?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
    organizationUser?: string | null;
    [key: string]: unknown;
}

export interface UserConfig {
    primary: string;
    individualUserRequired: boolean;
    organizationUserRequired: boolean;
}

export class User {
    individualUser: UserData | null;
    organizationUser: UserData | null;
    usePassword: boolean;
    config: UserConfig;

    constructor(
        individualUser: UserData | null = null,
        organizationUser: UserData | null = null,
        usePassword = false,
        primary = 'individual',
        individualUserRequired = true,
        organizationUserRequired = false
    ) {
        this.individualUser = individualUser;
        this.organizationUser = organizationUser;
        this.usePassword = usePassword;

        this.config = {
            primary,
            individualUserRequired,
            organizationUserRequired,
        };
    }

    getPrimaryUser(): UserData | null {
        if (this.config.primary === 'organization') {
            return this.organizationUser;
        }
        return this.individualUser;
    }

    getId(): string | undefined {
        return this.getPrimaryUser()?.id;
    }

    isPasswordRequired(): boolean {
        return this.usePassword;
    }

    async isPasswordValid(password: string): Promise<boolean> {
        if (!this.isPasswordRequired()) {
            return true;
        }

        return await bcrypt.compare(password, this.getPrimaryUser()!.hashword as string);
    }

    setIndividualUser(individualUser: UserData | null): void {
        this.individualUser = individualUser;
    }

    setOrganizationUser(organizationUser: UserData | null): void {
        this.organizationUser = organizationUser;
    }

    isOrganizationUserRequired(): boolean {
        return this.config.organizationUserRequired;
    }

    isIndividualUserRequired(): boolean {
        return this.config.individualUserRequired;
    }

    getIndividualUser(): UserData | null {
        return this.individualUser;
    }

    getOrganizationUser(): UserData | null {
        return this.organizationUser;
    }

    getAppUserId(): string | null {
        return this.individualUser?.appUserId || null;
    }

    getAppOrgId(): string | null {
        return this.organizationUser?.appOrgId || null;
    }

    ownsUserId(userId: string | number): boolean {
        const userIdStr = userId?.toString();
        const primaryId = this.getPrimaryUser()?.id?.toString();
        const individualId = this.individualUser?.id?.toString();
        const organizationId = this.organizationUser?.id?.toString();

        if (userIdStr === primaryId) {
            return true;
        }

        if (this.config.primary === 'organization' && userIdStr === individualId) {
            return true;
        }

        if (this.config.primary === 'individual' && this.config.organizationUserRequired && userIdStr === organizationId) {
            return true;
        }

        return false;
    }
}
