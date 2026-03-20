import { prisma } from '../../database/prisma';
import { CredentialRepositoryInterface } from './credential-repository-interface';
import type { CredentialData, CredentialUpsertParams, CredentialFilter, MutationResult } from './credential-repository-interface';

export class CredentialRepositoryPostgres extends CredentialRepositoryInterface {
    prisma: any;

    constructor() {
        super();
        this.prisma = prisma;
    }

    private _convertId(id: string | number | null | undefined): number | null | undefined {
        if (id === null || id === undefined) return id;
        const parsed = parseInt(String(id), 10);
        if (isNaN(parsed)) throw new Error(`Invalid ID: ${id} cannot be converted to integer`);
        return parsed;
    }

    async findCredentialById(id: string): Promise<CredentialData | null> {
        const intId = this._convertId(id);
        const credential = await this.prisma.credential.findUnique({ where: { id: intId } });
        if (!credential) return null;

        const data = credential.data || {};
        return {
            id: credential.id.toString(),
            userId: credential.userId.toString(),
            externalId: credential.externalId,
            authIsValid: credential.authIsValid,
            ...data,
        };
    }

    async updateAuthenticationStatus(credentialId: string, authIsValid: boolean): Promise<MutationResult> {
        const intId = this._convertId(credentialId);
        await this.prisma.credential.update({ where: { id: intId }, data: { authIsValid } });
        return { acknowledged: true, modifiedCount: 1 };
    }

    async deleteCredentialById(credentialId: string): Promise<MutationResult> {
        try {
            const intId = this._convertId(credentialId);
            await this.prisma.credential.delete({ where: { id: intId } });
            return { acknowledged: true, deletedCount: 1 };
        } catch (error: any) {
            if (error.code === 'P2025') return { acknowledged: true, deletedCount: 0 };
            throw error;
        }
    }

    async upsertCredential(credentialDetails: CredentialUpsertParams): Promise<CredentialData> {
        const { identifiers, details } = credentialDetails;
        if (!identifiers) throw new Error('identifiers required to upsert credential');
        if (!identifiers.userId) throw new Error('userId required in identifiers');
        if (!identifiers.externalId) {
            throw new Error(
                'externalId required in identifiers to prevent credential collision. ' +
                'When multiple credentials exist for the same user, both userId and externalId ' +
                'are needed to uniquely identify which credential to update.'
            );
        }

        const where = this._convertIdentifiersToWhere(identifiers);
        const { authIsValid, ...oauthData } = details;
        const existing = await this.prisma.credential.findFirst({ where });

        if (existing) {
            const mergedData = { ...(existing.data || {}), ...oauthData };
            const updated = await this.prisma.credential.update({
                where: { id: existing.id },
                data: {
                    userId: this._convertId(existing.userId),
                    externalId: existing.externalId,
                    authIsValid: authIsValid !== undefined ? authIsValid : existing.authIsValid,
                    data: mergedData,
                },
            });
            return {
                id: updated.id.toString(),
                externalId: updated.externalId,
                userId: updated.userId?.toString(),
                authIsValid: updated.authIsValid,
                ...(updated.data || {}),
            };
        }

        const created = await this.prisma.credential.create({
            data: {
                userId: where.userId,
                externalId: identifiers.externalId,
                authIsValid: authIsValid as boolean | undefined,
                data: oauthData,
            },
        });

        return {
            id: created.id.toString(),
            externalId: created.externalId,
            userId: created.userId?.toString(),
            authIsValid: created.authIsValid,
            ...(created.data || {}),
        };
    }

    async findCredential(filter: CredentialFilter): Promise<CredentialData | null> {
        const where = this._convertFilterToWhere(filter);
        const credential = await this.prisma.credential.findFirst({ where });
        if (!credential) return null;

        const data = credential.data || {};
        return {
            id: credential.id.toString(),
            userId: credential.userId?.toString(),
            externalId: credential.externalId,
            authIsValid: credential.authIsValid,
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            ...data,
        };
    }

    async updateCredential(credentialId: string, updates: Record<string, unknown>): Promise<CredentialData | null> {
        const intId = this._convertId(credentialId);
        const existing = await this.prisma.credential.findUnique({ where: { id: intId } });
        if (!existing) return null;

        const { authIsValid, ...oauthData } = updates;
        const mergedData = { ...(existing.data || {}), ...oauthData };

        const updated = await this.prisma.credential.update({
            where: { id: intId },
            data: {
                userId: this._convertId(existing.userId),
                externalId: existing.externalId,
                authIsValid: authIsValid as boolean | undefined,
                data: mergedData,
            },
        });

        const data = updated.data || {};
        return {
            id: updated.id.toString(),
            userId: updated.userId?.toString(),
            externalId: updated.externalId,
            authIsValid: updated.authIsValid,
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            ...data,
        };
    }

    private _convertIdentifiersToWhere(identifiers: Record<string, any>): Record<string, any> {
        const where: Record<string, any> = {};
        if (identifiers.id) where.id = this._convertId(identifiers.id);
        if (identifiers.userId) where.userId = this._convertId(identifiers.userId);
        if (identifiers.externalId) where.externalId = identifiers.externalId;
        return where;
    }

    private _convertFilterToWhere(filter: CredentialFilter): Record<string, any> {
        const where: Record<string, any> = {};
        if (filter.credentialId) where.id = this._convertId(filter.credentialId);
        if (filter.id) where.id = this._convertId(filter.id);
        if (filter.userId) where.userId = this._convertId(filter.userId);
        if (filter.externalId) where.externalId = filter.externalId;
        return where;
    }
}
