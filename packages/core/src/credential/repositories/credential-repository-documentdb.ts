import { prisma } from '../../database/prisma';
import { toObjectId, fromObjectId, findOne, insertOne, updateOne, deleteOne } from '../../database/documentdb-utils';
import { CredentialRepositoryInterface } from './credential-repository-interface';
import type { CredentialData, CredentialUpsertParams, CredentialFilter, MutationResult } from './credential-repository-interface';
import { DocumentDBEncryptionService } from '../../database/documentdb-encryption-service';

export class CredentialRepositoryDocumentDB extends CredentialRepositoryInterface {
    prisma: any;
    encryptionService: DocumentDBEncryptionService;

    constructor() {
        super();
        this.prisma = prisma;
        this.encryptionService = new DocumentDBEncryptionService();
    }

    async findCredentialById(id: string): Promise<CredentialData | null> {
        const objectId = toObjectId(id);
        if (!objectId) return null;
        const doc = await findOne(this.prisma, 'Credential', { _id: objectId });
        if (!doc) return null;

        const decryptedCredential = await this.encryptionService.decryptFields('Credential', doc);
        return this._mapCredentialById(decryptedCredential);
    }

    async updateAuthenticationStatus(credentialId: string, authIsValid: boolean): Promise<MutationResult> {
        const objectId = toObjectId(credentialId);
        if (!objectId) return { acknowledged: false, modifiedCount: 0 };
        const result = await updateOne(
            this.prisma, 'Credential',
            { _id: objectId },
            { $set: { authIsValid, updatedAt: new Date() } }
        );
        const modified = (result?.nModified as number) ?? (result?.n as number) ?? 0;
        return { acknowledged: true, modifiedCount: modified };
    }

    async deleteCredentialById(credentialId: string): Promise<MutationResult> {
        const objectId = toObjectId(credentialId);
        if (!objectId) return { acknowledged: true, deletedCount: 0 };
        const result = await deleteOne(this.prisma, 'Credential', { _id: objectId });
        const deleted = (result?.n as number) ?? 0;
        return { acknowledged: true, deletedCount: deleted };
    }

    async upsertCredential(credentialDetails: CredentialUpsertParams): Promise<CredentialData> {
        const { identifiers, details } = credentialDetails;
        if (!identifiers) throw new Error('identifiers required to upsert credential');
        if (!identifiers.userId) throw new Error('userId required in identifiers');
        if (!identifiers.externalId) {
            throw new Error(
                'externalId required in identifiers to prevent credential collision. When multiple credentials exist for the same user, both userId and externalId are needed to uniquely identify which credential to update.'
            );
        }

        const filter = this._buildIdentifierFilter(identifiers);
        const existing = await findOne(this.prisma, 'Credential', filter);
        const now = new Date();
        const { authIsValid, ...oauthData } = details || {};

        if (existing) {
            const decryptedExisting = await this.encryptionService.decryptFields('Credential', existing);
            const mergedData = { ...(decryptedExisting.data || {}), ...oauthData };

            const encryptedUpdate = await this.encryptionService.encryptFields('Credential', { data: mergedData });
            await updateOne(
                this.prisma, 'Credential',
                { _id: existing._id },
                {
                    $set: {
                        userId: existing.userId,
                        externalId: existing.externalId,
                        authIsValid: authIsValid !== undefined ? authIsValid : existing.authIsValid,
                        data: encryptedUpdate.data,
                        updatedAt: now,
                    },
                }
            );

            const updated = await findOne(this.prisma, 'Credential', { _id: existing._id });
            const decryptedCredential = await this.encryptionService.decryptFields('Credential', updated!);
            return this._mapCredential(decryptedCredential);
        }

        const plainDocument: Record<string, unknown> = {
            userId: toObjectId(identifiers.userId),
            externalId: identifiers.externalId,
            authIsValid: (details as any).authIsValid,
            data: { ...oauthData },
            createdAt: now,
            updatedAt: now,
        };

        const encryptedDocument = await this.encryptionService.encryptFields('Credential', plainDocument);
        const insertedId = await insertOne(this.prisma, 'Credential', encryptedDocument);
        const created = await findOne(this.prisma, 'Credential', { _id: insertedId });
        const decryptedCredential = await this.encryptionService.decryptFields('Credential', created!);
        return this._mapCredential(decryptedCredential);
    }

    async findCredential(filter: CredentialFilter): Promise<CredentialData | null> {
        const query = this._buildFilter(filter);
        const credential = await findOne(this.prisma, 'Credential', query);
        if (!credential) return null;

        const decryptedCredential = await this.encryptionService.decryptFields('Credential', credential);
        return this._mapCredential(decryptedCredential);
    }

    async updateCredential(credentialId: string, updates: Record<string, unknown>): Promise<CredentialData | null> {
        const objectId = toObjectId(credentialId);
        if (!objectId) return null;
        const existing = await findOne(this.prisma, 'Credential', { _id: objectId });
        if (!existing) return null;

        const { authIsValid, ...oauthData } = updates || {};
        const decryptedExisting = await this.encryptionService.decryptFields('Credential', existing);
        const mergedData = { ...(decryptedExisting.data || {}), ...oauthData };

        const encryptedUpdate = await this.encryptionService.encryptFields('Credential', { data: mergedData });
        await updateOne(
            this.prisma, 'Credential',
            { _id: objectId },
            {
                $set: {
                    userId: existing.userId,
                    externalId: existing.externalId,
                    authIsValid: authIsValid,
                    data: encryptedUpdate.data,
                    updatedAt: new Date(),
                },
            }
        );

        const updated = await findOne(this.prisma, 'Credential', { _id: objectId });
        const decryptedCredential = await this.encryptionService.decryptFields('Credential', updated!);
        return this._mapCredential(decryptedCredential);
    }

    private _buildIdentifierFilter(identifiers: Record<string, any>): Record<string, any> {
        const filter: Record<string, any> = {};
        if (identifiers._id || identifiers.id) {
            const idObj = toObjectId(identifiers._id || identifiers.id);
            if (idObj) filter._id = idObj;
        }
        if (identifiers.userId) filter.userId = toObjectId(identifiers.userId);
        if (identifiers.externalId !== undefined) filter.externalId = identifiers.externalId;
        return filter;
    }

    private _buildFilter(filter: CredentialFilter): Record<string, any> {
        const query: Record<string, any> = {};
        if (!filter) return query;
        if (filter.credentialId || filter.id) {
            const idObj = toObjectId((filter.credentialId || filter.id)!);
            if (idObj) query._id = idObj;
        }
        if (filter.userId !== undefined) query.userId = filter.userId;
        if (filter.externalId !== undefined) query.externalId = filter.externalId;
        return query;
    }

    private _mapCredential(doc: any): CredentialData {
        const data = doc?.data || {};
        return {
            id: fromObjectId(doc?._id),
            userId: doc?.userId,
            externalId: doc?.externalId ?? null,
            authIsValid: doc?.authIsValid ?? null,
            ...data,
        };
    }

    private _mapCredentialById(doc: any): CredentialData {
        const data = doc?.data || {};
        return {
            id: fromObjectId(doc?._id),
            userId: doc?.userId,
            externalId: doc?.externalId ?? null,
            authIsValid: doc?.authIsValid ?? null,
            ...data,
        };
    }
}
