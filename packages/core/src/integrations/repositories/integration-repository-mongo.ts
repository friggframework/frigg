import { IntegrationRepositoryInterface } from './integration-repository-interface';
import type { IntegrationRecord, IntegrationConfig, DeletionResult } from '../types';

const { prisma } = require('../../database/prisma');

export class IntegrationRepositoryMongo extends IntegrationRepositoryInterface {
    private readonly prisma: any;

    constructor() {
        super();
        this.prisma = prisma;
    }

    async findIntegrationsByUserId(userId: string): Promise<IntegrationRecord[]> {
        const integrations = await this.prisma.integration.findMany({
            where: { userId },
            include: { entities: true },
        });

        return integrations.map((integration: any) => ({
            id: integration.id,
            entitiesIds: integration.entities.map((e: any) => e.id),
            userId: integration.userId,
            config: integration.config,
            version: integration.version,
            status: integration.status,
            messages: integration.messages,
        }));
    }

    async deleteIntegrationById(integrationId: string): Promise<DeletionResult> {
        await this.prisma.integration.delete({
            where: { id: integrationId },
        });
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

        return {
            id: integration.id,
            entitiesIds: integration.entities.map((e: any) => e.id),
            userId: integration.userId,
            config: integration.config,
            version: integration.version,
            status: integration.status,
            messages: integration.messages,
        };
    }

    async findIntegrationById(id: string): Promise<IntegrationRecord> {
        const integration = await this.prisma.integration.findUnique({
            where: { id },
            include: { entities: true },
        });

        if (!integration) {
            throw new Error(`Integration with id ${id} not found`);
        }

        return {
            id: integration.id,
            entitiesIds: integration.entities.map((e: any) => e.id),
            userId: integration.userId,
            config: integration.config,
            version: integration.version,
            status: integration.status,
            messages: integration.messages,
        };
    }

    async updateIntegrationStatus(integrationId: string, status: string): Promise<boolean> {
        await this.prisma.integration.update({
            where: { id: integrationId },
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
        const integration = await this.prisma.integration.findUnique({
            where: { id: integrationId },
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
            where: { id: integrationId },
            data: { [messageType]: messageArray },
        });

        return true;
    }

    async createIntegration(entities: string[], userId: string, config: IntegrationConfig): Promise<IntegrationRecord> {
        const data = {
            config,
            version: '0.0.0',
            userId,
            entityIds: entities,
        };

        const integration = await this.prisma.integration.create({
            data,
            include: { entities: true },
        });

        return {
            id: integration.id,
            entitiesIds: integration.entities.map((e: any) => e.id),
            userId: integration.userId,
            config: integration.config,
            version: integration.version,
            status: integration.status,
            messages: integration.messages,
        };
    }

    async findIntegrationByUserId(userId: string): Promise<IntegrationRecord | null> {
        const integration = await this.prisma.integration.findFirst({
            where: { userId },
            include: { entities: true },
        });

        if (!integration) return null;

        return {
            id: integration.id,
            entitiesIds: integration.entities.map((e: any) => e.id),
            userId: integration.userId,
            config: integration.config,
            version: integration.version,
            status: integration.status,
            messages: integration.messages,
        };
    }

    async updateIntegrationConfig(integrationId: string, config: IntegrationConfig): Promise<IntegrationRecord> {
        if (config === null || config === undefined) {
            throw new Error('Config parameter is required');
        }

        const integration = await this.prisma.integration.update({
            where: { id: integrationId },
            data: { config },
            include: { entities: true },
        });

        return {
            id: integration.id,
            entitiesIds: integration.entities.map((e: any) => e.id),
            userId: integration.userId,
            config: integration.config,
            version: integration.version,
            status: integration.status,
            messages: integration.messages,
        };
    }
}
