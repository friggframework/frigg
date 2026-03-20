import bcrypt = require('bcryptjs');
import { TokenRepositoryInterface } from './token-repository-interface';
import type { TokenData, TokenObj, DeleteResult } from './token-repository-interface';

const { prisma } = require('../../database/prisma');

const BCRYPT_ROUNDS = 10;

export class TokenRepository extends TokenRepositoryInterface {
    private readonly prisma: any;

    constructor(prismaClient?: any) {
        super();
        this.prisma = prismaClient || prisma;
    }

    async createTokenWithExpire(userId: string, rawToken: string, minutes: number): Promise<TokenData> {
        const tokenHash = await bcrypt.hash(rawToken, BCRYPT_ROUNDS);
        const expires = new Date(Date.now() + minutes * 60000);

        return await this.prisma.token.create({
            data: {
                token: tokenHash,
                expires,
                userId,
            },
        });
    }

    async validateAndGetToken(tokenObj: TokenObj): Promise<TokenData> {
        const sessionToken = await this.prisma.token.findUnique({
            where: { id: tokenObj.id },
        });

        if (!sessionToken) {
            throw new Error('Invalid Token: Token does not exist');
        }

        const isValid = await bcrypt.compare(
            tokenObj.token,
            sessionToken.token
        );
        if (!isValid) {
            throw new Error('Invalid Token: Token does not match');
        }

        if (
            sessionToken.expires &&
            new Date(sessionToken.expires) < new Date()
        ) {
            throw new Error('Invalid Token: Token is expired');
        }

        return sessionToken;
    }

    async findTokenById(tokenId: string): Promise<TokenData | null> {
        return await this.prisma.token.findUnique({
            where: { id: tokenId },
        });
    }

    async findTokensByUserId(userId: string): Promise<TokenData[]> {
        return await this.prisma.token.findMany({
            where: { userId },
        });
    }

    async deleteToken(tokenId: string): Promise<DeleteResult> {
        try {
            await this.prisma.token.delete({
                where: { id: tokenId },
            });
            return { acknowledged: true, deletedCount: 1 };
        } catch (error: any) {
            if (error.code === 'P2025') {
                return { acknowledged: true, deletedCount: 0 };
            }
            throw error;
        }
    }

    async deleteExpiredTokens(): Promise<DeleteResult> {
        const result = await this.prisma.token.deleteMany({
            where: {
                expires: {
                    lt: new Date(),
                },
            },
        });

        return {
            acknowledged: true,
            deletedCount: result.count,
        };
    }

    async deleteTokensByUserId(userId: string): Promise<DeleteResult> {
        const result = await this.prisma.token.deleteMany({
            where: { userId },
        });

        return {
            acknowledged: true,
            deletedCount: result.count,
        };
    }

    createJSONToken(token: TokenData, rawToken: string): string {
        return JSON.stringify({
            id: token.id,
            token: rawToken,
        });
    }

    createBase64BufferToken(token: TokenData, rawToken: string): string {
        const jsonVal = this.createJSONToken(token, rawToken);
        return Buffer.from(jsonVal).toString('base64');
    }

    getJSONTokenFromBase64BufferToken(buffer: string): TokenObj {
        const tokenStr = Buffer.from(buffer.trim(), 'base64').toString('ascii');
        return JSON.parse(tokenStr);
    }
}
