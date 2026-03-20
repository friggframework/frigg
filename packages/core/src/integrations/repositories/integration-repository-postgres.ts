import { IntegrationRepositoryInterface } from './integration-repository-interface';
import type { IntegrationRecord, IntegrationConfig, DeletionResult } from '../types';

const { prisma } = require('../../database/prisma');

export class IntegrationRepositoryPostgres extends IntegrationRepositoryInterface {
    private readonly prisma: any;

    constructor() {
        super();
        this.prisma = prisma;
    }

    private _convertId(id: unknown): number | null | undefined {
        if (id === null || id === undefined) return id as null | undefined;
        const parsed = Number.parseInt(String(id), 10);
        if (Number.isNaN(parsed)) {
            throw new Error(`Invalid ID: ${id} cannot be converted to integer`);
        }
        return parsed;
    }

    private _convertIntegrationIds(integration: any): any {
        if (!integration) return integration;
        return {
            ...integration,
            id: integration.id?.toString(),
            userId: integration.userId?.toString(),
            entities: integration.entities?.map((e: any) => ({
                ...e,
                id: e.id?.toString(),
                userId: e.userId?.toString(),
                credentialId: e.credentialId?.toString(),
            })),
        };
    }

    async findIntegrationsByUserId(userId: string): Promise<IntegrationRecord[]> {
        const intUserId = this._convertId(userId);
        const integrations = await this.prisma.integration.findMany({
            where: { userId: intUserId },
            include: { entities: true },
        });

        return integrations.map((integration: any) => {
            const converted = this._convertIntegrationIds(integration);
            return {
                id: converted.id,
                entitiesIds: converted.entities.map((e: any) => e.id),
                userId: converted.userId,
                config: converted.config,
                version: converted.version,
                status: converted.status,
                messages: converted.messages,
            };
        });
    }

    async deleteIntegrationById(integrationId: string): Promise<DeletionResult> {
        const intId = this._convertId(integrationId);
        await this.prisma.integration.delete({ where: { id: intId } });
        return { acknowledged: true, deletedCount: 1 };
    }

    async findIntegrationByName(name: string): Promise<IntegrationRecord> {
        const integration = await this.prisma.integration.findFirst({
            where: { config: { path: ['type'], equals: name } },
            include: { entities: true },
        });

        if (!integration) {
            throw new Error(`Integration with name ${name} not found`);
        }

        const converted = this._convertIntegrationIds(integration);
        return {
            id: converted.id,
            entitiesIds: converted.entities.map((e: any) => e.id),
            userId: converted.userId,
            config: converted.config,
            version: converted.version,
            status: converted.status,
            messages: converted.messages,
        };
    }

    async findIntegrationById(id: string): Promise<IntegrationRecord> {
        const intId = this._convertId(id);
        const integration = await this.prisma.integration.findUnique({
            where: { id: intId },
            include: { entities: true },
        });

        if (!integration) {
            throw new Error(`Integration with id ${id} not found`);
        }

        const converted = this._convertIntegrationIds(integration);
        return {
            id: converted.id,
            entitiesIds: converted.entities.map((e: any) => e.id),
            userId: converted.userId,
            config: converted.config,
            version: converted.version,
            status: converted.status,
            messages: converted.messages,
        };
    }

    async updateIntegrationStatus(integrationId: string, status: string): Promise<boolean> {
        const intId = this._convertId(integrationId);
        await this.prisma.integration.update({
            where: { id: intId },
            data: { status },
        });
        return true;
    }

    async updateIntegrationMessages(
        integrationId: string,
        messageType: string,
        messageTitle: string,
        messageBody: string,
        messageTimestamp: number | Date
    ): Promise<boolean> {
        const intId = this._convertId(integrationId);
        const integration = await this.prisma.integration.findUnique({
            where: { id: intId },
        });

        if (!integration) {
            throw new Error(`Integration ${integrationId} not found`);
        }

        const messages: any = integration.messages || {};
        const messageArray = Array.isArray(messages[messageType])
            ? messages[messageType]
            : [];

        messageArray.push({
            title: messageTitle,
            message: messageBody,
            timestamp: messageTimestamp,
        });

        await this.prisma.integration.update({
            where: { id: intId },
            data: { [messageType]: messageArray },
        });

        return true;
    }

    async createIntegration(entities: string[], userId: string, config: IntegrationConfig): Promise<IntegrationRecord> {
        const data: any = { config, version: '0.0.0' };

        if (userId) {
            data.user = { connect: { id: this._convertId(userId) } };
        }
        if (entities && entities.length > 0) {
            data.entities = {
                connect: entities.map((id) => ({ id: this._convertId(id) })),
            };
        }

        const integration = await this.prisma.integration.create({
            data,
            include: { entities: true },
        });

        const converted = this._convertIntegrationIds(integration);
        return {
            id: converted.id,
            entitiesIds: converted.entities.map((e: any) => e.id),
            userId: converted.userId,
            config: converted.config,
            version: converted.version,
            status: converted.status,
            messages: converted.messages,
        };
    }

    async findIntegrationByUserId(userId: string): Promise<IntegrationRecord | null> {
        const intUserId = this._convertId(userId);
        const integration = await this.prisma.integration.findFirst({
            where: { userId: intUserId },
            include: { entities: true },
        });

        if (!integration) return null;

        const converted = this._convertIntegrationIds(integration);
        return {
            id: converted.id,
            entitiesIds: converted.entities.map((e: any) => e.id),
            userId: converted.userId,
            config: converted.config,
            version: converted.version,
            status: converted.status,
            messages: converted.messages,
        };
    }

    async updateIntegrationConfig(integrationId: string, config: IntegrationConfig): Promise<IntegrationRecord> {
        if (config === null || config === undefined) {
            throw new Error('Config parameter is required');
        }

        const intId = this._convertId(integrationId);
        const integration = await this.prisma.integration.update({
            where: { id: intId },
            data: { config },
            include: { entities: true },
        });

        const converted = this._convertIntegrationIds(integration);
        return {
            id: converted.id,
            entitiesIds: converted.entities.map((e: any) => e.id),
            userId: converted.userId,
            config: converted.config,
            version: converted.version,
            status: converted.status,
            messages: converted.messages,
        };
    }
}
