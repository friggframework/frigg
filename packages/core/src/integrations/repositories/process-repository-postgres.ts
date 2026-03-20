import { ProcessRepositoryInterface } from './process-repository-interface';
import type { ProcessRecord, ProcessData } from '../types';

const { prisma } = require('../../database/prisma');

export class ProcessRepositoryPostgres extends ProcessRepositoryInterface {
    private prisma: any;

    constructor() {
        super();
        this.prisma = prisma;
    }

    private _convertId(id: unknown): number | null | undefined {
        if (id === null || id === undefined) return id as null | undefined;
        const parsed = parseInt(String(id), 10);
        if (isNaN(parsed)) {
            throw new Error(`Invalid ID: ${id} cannot be converted to integer`);
        }
        return parsed;
    }

    async create(processData: ProcessData): Promise<ProcessRecord> {
        const process = await this.prisma.process.create({
            data: {
                userId: this._convertId(processData.userId),
                integrationId: this._convertId(processData.integrationId),
                name: processData.name,
                type: processData.type,
                state: processData.state || 'INITIALIZING',
                context: processData.context || {},
                results: processData.results || {},
                parentProcessId: this._convertId(processData.parentProcessId),
            },
        });
        return this._toPlainObject(process);
    }

    async findById(processId: string): Promise<ProcessRecord | null> {
        const process = await this.prisma.process.findUnique({
            where: { id: this._convertId(processId) },
        });
        return process ? this._toPlainObject(process) : null;
    }

    async update(processId: string, updates: Partial<ProcessRecord>): Promise<ProcessRecord> {
        const updateData: any = {};
        if (updates.state !== undefined) updateData.state = updates.state;
        if (updates.context !== undefined) updateData.context = updates.context;
        if (updates.results !== undefined) updateData.results = updates.results;
        if (updates.parentProcessId !== undefined) {
            updateData.parentProcessId = this._convertId(updates.parentProcessId);
        }

        const process = await this.prisma.process.update({
            where: { id: this._convertId(processId) },
            data: updateData,
        });
        return this._toPlainObject(process);
    }

    async findByIntegrationAndType(integrationId: string, type: string): Promise<ProcessRecord[]> {
        const processes = await this.prisma.process.findMany({
            where: {
                integrationId: this._convertId(integrationId),
                type,
            },
            orderBy: { createdAt: 'desc' },
        });
        return processes.map((p: any) => this._toPlainObject(p));
    }

    async findActiveProcesses(integrationId: string, excludeStates: string[] = ['COMPLETED', 'ERROR']): Promise<ProcessRecord[]> {
        const processes = await this.prisma.process.findMany({
            where: {
                integrationId: this._convertId(integrationId),
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
            where: { id: this._convertId(processId) },
        });
    }

    private _toPlainObject(process: any): ProcessRecord {
        return {
            id: String(process.id),
            userId: String(process.userId),
            integrationId: String(process.integrationId),
            name: process.name,
            type: process.type,
            state: process.state,
            context: process.context,
            results: process.results,
            childProcesses: Array.isArray(process.childProcesses)
                ? process.childProcesses.length > 0 &&
                    typeof process.childProcesses[0] === 'object' &&
                    process.childProcesses[0] !== null
                    ? process.childProcesses.map((child: any) => String(child.id))
                    : process.childProcesses
                : [],
            parentProcessId:
                process.parentProcessId !== null
                    ? String(process.parentProcessId)
                    : null,
            createdAt: process.createdAt,
            updatedAt: process.updatedAt,
        };
    }
}
