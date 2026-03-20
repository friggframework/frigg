import { ProcessRepositoryInterface } from './process-repository-interface';
import type { ProcessRecord, ProcessData } from '../types';

const { prisma } = require('../../database/prisma');

export class ProcessRepositoryMongo extends ProcessRepositoryInterface {
    private prisma: any;

    constructor() {
        super();
        this.prisma = prisma;
    }

    async create(processData: ProcessData): Promise<ProcessRecord> {
        const process = await this.prisma.process.create({
            data: {
                userId: processData.userId,
                integrationId: processData.integrationId,
                name: processData.name,
                type: processData.type,
                state: processData.state || 'INITIALIZING',
                context: processData.context || {},
                results: processData.results || {},
                childProcesses: processData.childProcesses || [],
                parentProcessId: processData.parentProcessId || null,
            },
        });
        return this._toPlainObject(process);
    }

    async findById(processId: string): Promise<ProcessRecord | null> {
        const process = await this.prisma.process.findUnique({
            where: { id: processId },
        });
        return process ? this._toPlainObject(process) : null;
    }

    async update(processId: string, updates: Partial<ProcessRecord>): Promise<ProcessRecord> {
        const updateData: any = {};
        if (updates.state !== undefined) updateData.state = updates.state;
        if (updates.context !== undefined) updateData.context = updates.context;
        if (updates.results !== undefined) updateData.results = updates.results;
        if (updates.childProcesses !== undefined) updateData.childProcesses = updates.childProcesses;
        if (updates.parentProcessId !== undefined) updateData.parentProcessId = updates.parentProcessId;

        const process = await this.prisma.process.update({
            where: { id: processId },
            data: updateData,
        });
        return this._toPlainObject(process);
    }

    async findByIntegrationAndType(integrationId: string, type: string): Promise<ProcessRecord[]> {
        const processes = await this.prisma.process.findMany({
            where: { integrationId, type },
            orderBy: { createdAt: 'desc' },
        });
        return processes.map((p: any) => this._toPlainObject(p));
    }

    async findActiveProcesses(integrationId: string, excludeStates: string[] = ['COMPLETED', 'ERROR']): Promise<ProcessRecord[]> {
        const processes = await this.prisma.process.findMany({
            where: {
                integrationId,
                state: { notIn: excludeStates },
            },
            orderBy: { createdAt: 'desc' },
        });
        return processes.map((p: any) => this._toPlainObject(p));
    }

    async findByName(name: string): Promise<ProcessRecord | null> {
        const process = await this.prisma.process.findFirst({
            where: { name },
            orderBy: { createdAt: 'desc' },
        });
        return process ? this._toPlainObject(process) : null;
    }

    async deleteById(processId: string): Promise<void> {
        await this.prisma.process.delete({
            where: { id: processId },
        });
    }

    private _toPlainObject(process: any): ProcessRecord {
        return {
            id: process.id,
            userId: process.userId,
            integrationId: process.integrationId,
            name: process.name,
            type: process.type,
            state: process.state,
            context: process.context,
            results: process.results,
            childProcesses: process.childProcesses,
            parentProcessId: process.parentProcessId,
            createdAt: process.createdAt,
            updatedAt: process.updatedAt,
        };
    }
}
