import bcrypt from 'bcryptjs';
import { prisma } from '../../database/prisma';
import { createTokenRepository } from '../../token/repositories/token-repository-factory';
import { UserRepositoryInterface } from './user-repository-interface';
import type { CreateIndividualUserParams, CreateOrganizationUserParams, SessionToken } from './user-repository-interface';
import type { UserData } from '../user';
import { ClientSafeError } from '../../errors';

export class UserRepositoryMongo extends UserRepositoryInterface {
    readonly prisma: any;
    readonly tokenRepository: ReturnType<typeof createTokenRepository>;

    constructor() {
        super();
        this.prisma = prisma;
        this.tokenRepository = createTokenRepository();
    }

    async getSessionToken(token: string): Promise<SessionToken> {
        const jsonToken = this.tokenRepository.getJSONTokenFromBase64BufferToken(token);
        const sessionToken = await this.tokenRepository.validateAndGetToken(jsonToken);
        return sessionToken;
    }

    async findOrganizationUserById(userId: string): Promise<UserData | null> {
        return await this.prisma.user.findFirst({
            where: { id: userId, type: 'ORGANIZATION' },
        });
    }

    async findIndividualUserById(userId: string): Promise<UserData | null> {
        return await this.prisma.user.findFirst({
            where: { id: userId, type: 'INDIVIDUAL' },
        });
    }

    async createToken(userId: string, rawToken: string, minutes = 120): Promise<string> {
        const createdToken = await this.tokenRepository.createTokenWithExpire(userId, rawToken, minutes);
        return this.tokenRepository.createBase64BufferToken(createdToken, rawToken);
    }

    async createIndividualUser(params: CreateIndividualUserParams): Promise<UserData> {
        const data: Record<string, unknown> = {
            type: 'INDIVIDUAL',
            email: params.email,
            username: params.username,
            appUserId: params.appUserId,
            organizationId: params.organization || params.organizationId,
        };

        if (params.hashword !== undefined && params.hashword !== null && params.hashword !== '') {
            if (typeof params.hashword !== 'string') {
                throw new ClientSafeError('Password must be a string', 400);
            }
            if (params.hashword.startsWith('$2')) {
                throw new Error('Password appears to be already hashed. Pass plain text password only.');
            }
            data.hashword = await bcrypt.hash(params.hashword, 10);
        }

        return await this.prisma.user.create({ data });
    }

    async createOrganizationUser(params: CreateOrganizationUserParams): Promise<UserData> {
        return await this.prisma.user.create({
            data: { type: 'ORGANIZATION', appOrgId: params.appOrgId, name: params.name },
        });
    }

    async findIndividualUserByUsername(username: string): Promise<UserData | null> {
        return await this.prisma.user.findFirst({
            where: { type: 'INDIVIDUAL', username },
        });
    }

    async findIndividualUserByAppUserId(appUserId: string): Promise<UserData | null> {
        return await this.prisma.user.findFirst({
            where: { type: 'INDIVIDUAL', appUserId },
        });
    }

    async findOrganizationUserByAppOrgId(appOrgId: string): Promise<UserData | null> {
        return await this.prisma.user.findFirst({
            where: { type: 'ORGANIZATION', appOrgId },
        });
    }

    async findIndividualUserByEmail(email: string): Promise<UserData | null> {
        return await this.prisma.user.findFirst({
            where: { type: 'INDIVIDUAL', email },
        });
    }

    async updateIndividualUser(userId: string, updates: Partial<UserData>): Promise<UserData> {
        const data: Record<string, unknown> = { ...updates };

        if (data.hashword !== undefined && data.hashword !== null && data.hashword !== '') {
            if (typeof data.hashword !== 'string') {
                throw new ClientSafeError('Password must be a string', 400);
            }
            if ((data.hashword as string).startsWith('$2')) {
                throw new Error('Password appears to be already hashed. Pass plain text password only.');
            }
            data.hashword = await bcrypt.hash(data.hashword as string, 10);
        }

        return await this.prisma.user.update({ where: { id: userId }, data });
    }

    async updateOrganizationUser(userId: string, updates: Partial<UserData>): Promise<UserData> {
        return await this.prisma.user.update({ where: { id: userId }, data: updates });
    }

    async deleteUser(userId: string): Promise<boolean> {
        try {
            await this.prisma.user.delete({ where: { id: userId } });
            return true;
        } catch (error: any) {
            if (error.code === 'P2025') return false;
            throw error;
        }
    }

    async linkIndividualToOrganization(individualUserId: string, organizationUserId: string): Promise<UserData> {
        return await this.prisma.user.update({
            where: { id: individualUserId, type: 'INDIVIDUAL' },
            data: { organizationId: organizationUserId },
        });
    }
}
