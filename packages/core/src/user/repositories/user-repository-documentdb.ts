import bcrypt from 'bcryptjs';
import { prisma } from '../../database/prisma';
import { toObjectId, fromObjectId, findOne, insertOne, updateOne, deleteOne } from '../../database/documentdb-utils';
import { createTokenRepository } from '../../token/repositories/token-repository-factory';
import { UserRepositoryInterface } from './user-repository-interface';
import type { CreateIndividualUserParams, CreateOrganizationUserParams, SessionToken } from './user-repository-interface';
import type { UserData } from '../user';
import { ClientSafeError } from '../../errors';
import { DocumentDBEncryptionService } from '../../database/documentdb-encryption-service';

export class UserRepositoryDocumentDB extends UserRepositoryInterface {
    readonly prisma: any;
    readonly tokenRepository: ReturnType<typeof createTokenRepository>;
    readonly encryptionService: DocumentDBEncryptionService;

    constructor() {
        super();
        this.prisma = prisma;
        this.tokenRepository = createTokenRepository();
        this.encryptionService = new DocumentDBEncryptionService();
    }

    async getSessionToken(token: string): Promise<SessionToken> {
        const jsonToken = this.tokenRepository.getJSONTokenFromBase64BufferToken(token);
        const sessionToken = await this.tokenRepository.validateAndGetToken(jsonToken);
        return sessionToken;
    }

    async findOrganizationUserById(userId: string): Promise<UserData | null> {
        const doc = await findOne(this.prisma, 'User', {
            _id: toObjectId(userId),
            type: 'ORGANIZATION',
        });
        if (!doc) return null;
        const decrypted = await this.encryptionService.decryptFields('User', doc);
        return this._mapUser(decrypted);
    }

    async findIndividualUserById(userId: string): Promise<UserData | null> {
        const doc = await findOne(this.prisma, 'User', {
            _id: toObjectId(userId),
            type: 'INDIVIDUAL',
        });
        if (!doc) return null;
        const decrypted = await this.encryptionService.decryptFields('User', doc);
        return this._mapUser(decrypted);
    }

    async createToken(userId: string, rawToken: string, minutes = 120): Promise<string> {
        const createdToken = await this.tokenRepository.createTokenWithExpire(
            fromObjectId(toObjectId(userId)) as string,
            rawToken,
            minutes
        );
        return this.tokenRepository.createBase64BufferToken(createdToken, rawToken);
    }

    async createIndividualUser(params: CreateIndividualUserParams): Promise<UserData> {
        const now = new Date();
        const document: Record<string, unknown> = {
            type: 'INDIVIDUAL',
            email: params.email ?? null,
            username: params.username ?? null,
            appUserId: params.appUserId ?? null,
            organizationId: params.organization
                ? toObjectId(params.organization)
                : params.organizationId
                ? toObjectId(params.organizationId)
                : null,
            createdAt: now,
            updatedAt: now,
        };

        if (params.hashword !== undefined && params.hashword !== null && params.hashword !== '') {
            if (typeof params.hashword !== 'string') {
                throw new ClientSafeError('Password must be a string', 400);
            }
            if (params.hashword.startsWith('$2')) {
                throw new Error('Password appears to be already hashed. Pass plain text password only.');
            }
            document.hashword = await bcrypt.hash(params.hashword, 10);
        }

        const encryptedDocument = await this.encryptionService.encryptFields('User', document);
        const insertedId = await insertOne(this.prisma, 'User', encryptedDocument);
        const created = await findOne(this.prisma, 'User', { _id: insertedId });

        if (!created) {
            console.error('[UserRepositoryDocumentDB] User not found after insert', {
                insertedId: fromObjectId(insertedId),
                params: { username: params.username, appUserId: params.appUserId, email: params.email },
            });
            throw new Error(
                'Failed to create individual user: Document not found after insert. ' +
                'This indicates a database consistency issue.'
            );
        }

        const decrypted = await this.encryptionService.decryptFields('User', created);
        return this._mapUser(decrypted)!;
    }

    async createOrganizationUser(params: CreateOrganizationUserParams): Promise<UserData> {
        const now = new Date();
        const document: Record<string, unknown> = {
            type: 'ORGANIZATION',
            appOrgId: params.appOrgId ?? null,
            name: params.name ?? null,
            createdAt: now,
            updatedAt: now,
        };

        const encryptedDocument = await this.encryptionService.encryptFields('User', document);
        const insertedId = await insertOne(this.prisma, 'User', encryptedDocument);
        const created = await findOne(this.prisma, 'User', { _id: insertedId });

        if (!created) {
            console.error('[UserRepositoryDocumentDB] Organization user not found after insert', {
                insertedId: fromObjectId(insertedId),
                params: { appOrgId: params.appOrgId, name: params.name },
            });
            throw new Error(
                'Failed to create organization user: Document not found after insert. ' +
                'This indicates a database consistency issue.'
            );
        }

        const decrypted = await this.encryptionService.decryptFields('User', created);
        return this._mapUser(decrypted)!;
    }

    async findIndividualUserByUsername(username: string): Promise<UserData | null> {
        const doc = await findOne(this.prisma, 'User', { type: 'INDIVIDUAL', username });
        if (!doc) return null;
        const decrypted = await this.encryptionService.decryptFields('User', doc);
        return this._mapUser(decrypted);
    }

    async findIndividualUserByAppUserId(appUserId: string): Promise<UserData | null> {
        const doc = await findOne(this.prisma, 'User', { type: 'INDIVIDUAL', appUserId });
        if (!doc) return null;
        const decrypted = await this.encryptionService.decryptFields('User', doc);
        return this._mapUser(decrypted);
    }

    async findOrganizationUserByAppOrgId(appOrgId: string): Promise<UserData | null> {
        const doc = await findOne(this.prisma, 'User', { type: 'ORGANIZATION', appOrgId });
        if (!doc) return null;
        const decrypted = await this.encryptionService.decryptFields('User', doc);
        return this._mapUser(decrypted);
    }

    async findIndividualUserByEmail(email: string): Promise<UserData | null> {
        const doc = await findOne(this.prisma, 'User', { type: 'INDIVIDUAL', email });
        if (!doc) return null;
        const decrypted = await this.encryptionService.decryptFields('User', doc);
        return this._mapUser(decrypted);
    }

    async updateIndividualUser(userId: string, updates: Partial<UserData>): Promise<UserData> {
        const objectId = toObjectId(userId);
        if (!objectId) return null as any;

        const payload = await this._prepareUpdatePayload(updates);
        payload.updatedAt = new Date();

        const encryptedPayload = await this.encryptionService.encryptFields('User', payload);
        await updateOne(this.prisma, 'User', { _id: objectId, type: 'INDIVIDUAL' }, { $set: encryptedPayload });

        const updated = await findOne(this.prisma, 'User', { _id: objectId });

        if (!updated) {
            console.error('[UserRepositoryDocumentDB] Individual user not found after update', {
                userId: fromObjectId(objectId),
                updates,
            });
            throw new Error(
                'Failed to update individual user: Document not found after update. ' +
                'This indicates a database consistency issue.'
            );
        }

        const decrypted = await this.encryptionService.decryptFields('User', updated);
        return this._mapUser(decrypted)!;
    }

    async updateOrganizationUser(userId: string, updates: Partial<UserData>): Promise<UserData> {
        const objectId = toObjectId(userId);
        if (!objectId) return null as any;

        const payload: Record<string, unknown> = { ...updates, updatedAt: new Date() };
        const encryptedPayload = await this.encryptionService.encryptFields('User', payload);

        await updateOne(this.prisma, 'User', { _id: objectId, type: 'ORGANIZATION' }, { $set: encryptedPayload });

        const updated = await findOne(this.prisma, 'User', { _id: objectId });

        if (!updated) {
            console.error('[UserRepositoryDocumentDB] Organization user not found after update', {
                userId: fromObjectId(objectId),
                updates,
            });
            throw new Error(
                'Failed to update organization user: Document not found after update. ' +
                'This indicates a database consistency issue.'
            );
        }

        const decrypted = await this.encryptionService.decryptFields('User', updated);
        return this._mapUser(decrypted)!;
    }

    async deleteUser(userId: string): Promise<boolean> {
        const objectId = toObjectId(userId);
        if (!objectId) return false;

        const result = await deleteOne(this.prisma, 'User', { _id: objectId });
        const deleted = (result?.n as number) ?? 0;
        return deleted > 0;
    }

    async linkIndividualToOrganization(individualUserId: string, organizationUserId: string): Promise<UserData> {
        const doc = await updateOne(
            this.prisma,
            'User',
            { _id: toObjectId(individualUserId), type: 'INDIVIDUAL' },
            { $set: { organizationId: toObjectId(organizationUserId) } }
        );
        const decrypted = await this.encryptionService.decryptFields('User', doc);
        return this._mapUser(decrypted)!;
    }

    private _mapUser(doc: any): UserData | null {
        if (!doc) {
            console.warn('[UserRepositoryDocumentDB] _mapUser received null/undefined document');
            return null;
        }

        return {
            id: fromObjectId(doc?._id) || undefined,
            type: doc?.type ?? null,
            email: doc?.email ?? null,
            username: doc?.username ?? null,
            hashword: doc?.hashword ?? null,
            appUserId: doc?.appUserId ?? null,
            organizationId: doc?.organizationId ? fromObjectId(doc.organizationId) : null,
            appOrgId: doc?.appOrgId ?? null,
            name: doc?.name ?? null,
            createdAt: this._parseDate(doc?.createdAt),
            updatedAt: this._parseDate(doc?.updatedAt),
        };
    }

    private async _prepareUpdatePayload(updates: Record<string, any> = {}): Promise<Record<string, unknown>> {
        const payload: Record<string, unknown> = { ...updates };

        if (payload.hashword !== undefined && payload.hashword !== null && payload.hashword !== '') {
            if (typeof payload.hashword !== 'string') {
                throw new ClientSafeError('Password must be a string', 400);
            }
            if ((payload.hashword as string).startsWith('$2')) {
                throw new Error('Password appears to be already hashed. Pass plain text password only.');
            }
            payload.hashword = await bcrypt.hash(payload.hashword as string, 10);
        }

        if (payload.organization !== undefined) {
            payload.organizationId = toObjectId(payload.organization as string);
            delete payload.organization;
        }

        if (payload.organizationId !== undefined) {
            payload.organizationId = payload.organizationId
                ? toObjectId(payload.organizationId as string)
                : null;
        }

        return payload;
    }

    private _parseDate(value: any): Date | undefined {
        if (!value) return undefined;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? undefined : date;
    }
}
