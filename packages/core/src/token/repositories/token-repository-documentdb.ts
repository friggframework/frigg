import { prisma } from '../../database/prisma';
import bcrypt from 'bcryptjs';
import { toObjectId, fromObjectId, findMany, findOne, insertOne, deleteOne, deleteMany } from '../../database/documentdb-utils';
import { TokenRepositoryInterface } from './token-repository-interface';
import type { TokenData, TokenObj, DeleteResult } from './token-repository-interface';
import { ClientSafeError } from '../../errors';

const BCRYPT_ROUNDS = 10;

export class TokenRepositoryDocumentDB extends TokenRepositoryInterface {
    readonly prisma: any;

    constructor() {
        super();
        this.prisma = prisma;
    }

    async createTokenWithExpire(userId: string, rawToken: string, minutes: number): Promise<TokenData> {
        const tokenHash = await bcrypt.hash(rawToken, BCRYPT_ROUNDS);
        const expires = new Date(Date.now() + minutes * 60000);
        const now = new Date();
        const document = {
            token: tokenHash,
            expires,
            userId: toObjectId(userId),
            created: now,
        };
        const insertedId = await insertOne(this.prisma, 'Token', document);
        const created = await findOne(this.prisma, 'Token', { _id: insertedId });
        return this._mapToken(created)!;
    }

    async validateAndGetToken(tokenObj: TokenObj): Promise<TokenData> {
        const objectId = toObjectId(tokenObj.id);
        if (!objectId) throw new ClientSafeError('Invalid Token: Token does not exist', 401);

        const record = await findOne(this.prisma, 'Token', { _id: objectId });
        if (!record) throw new ClientSafeError('Invalid Token: Token does not exist', 401);

        const isValid = await bcrypt.compare(tokenObj.token, record.token as string);
        if (!isValid) throw new ClientSafeError('Invalid Token: Token does not match', 401);

        if (record.expires && new Date(record.expires as string | number | Date) < new Date()) {
            throw new ClientSafeError('Invalid Token: Token is expired', 401);
        }

        return this._mapToken(record)!;
    }

    async findTokenById(tokenId: string): Promise<TokenData | null> {
        const objectId = toObjectId(tokenId);
        if (!objectId) return null;
        const record = await findOne(this.prisma, 'Token', { _id: objectId });
        return record ? this._mapToken(record) : null;
    }

    async findTokensByUserId(userId: string): Promise<TokenData[]> {
        const objectId = toObjectId(userId);
        const filter = objectId ? { userId: objectId } : {};
        const records = await findMany(this.prisma, 'Token', filter);
        return records.map((record: any) => this._mapToken(record)!);
    }

    async deleteToken(tokenId: string): Promise<DeleteResult> {
        const objectId = toObjectId(tokenId);
        if (!objectId) return { acknowledged: true, deletedCount: 0 };
        const result = await deleteOne(this.prisma, 'Token', { _id: objectId });
        const deleted = (result?.n as number) ?? 0;
        return { acknowledged: true, deletedCount: deleted };
    }

    async deleteExpiredTokens(): Promise<DeleteResult> {
        const result = await deleteMany(this.prisma, 'Token', { expires: { $lt: new Date() } });
        const deleted = (result?.n as number) ?? 0;
        return { acknowledged: true, deletedCount: deleted };
    }

    async deleteTokensByUserId(userId: string): Promise<DeleteResult> {
        const objectId = toObjectId(userId);
        if (!objectId) return { acknowledged: true, deletedCount: 0 };
        const result = await deleteMany(this.prisma, 'Token', { userId: objectId });
        const deleted = (result?.n as number) ?? 0;
        return { acknowledged: true, deletedCount: deleted };
    }

    createJSONToken(token: TokenData, rawToken: string): string {
        return JSON.stringify({ id: token.id, token: rawToken });
    }

    createBase64BufferToken(token: TokenData, rawToken: string): string {
        const jsonVal = this.createJSONToken(token, rawToken);
        return Buffer.from(jsonVal).toString('base64');
    }

    getJSONTokenFromBase64BufferToken(buffer: string): TokenObj {
        const tokenStr = Buffer.from(buffer.trim(), 'base64').toString('ascii');
        return JSON.parse(tokenStr);
    }

    private _mapToken(record: any): TokenData | null {
        if (!record) return null;
        return {
            id: fromObjectId(record._id) || undefined,
            token: record.token,
            expires: record.expires ? new Date(record.expires) : null,
            userId: fromObjectId(record.userId) || undefined,
            created: record.created ? new Date(record.created) : null,
        };
    }
}
