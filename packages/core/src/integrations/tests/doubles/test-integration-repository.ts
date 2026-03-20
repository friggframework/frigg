import { v4 as uuid } from 'uuid';

export class TestIntegrationRepository {
    store: Map<string, any>;
    operationHistory: any[];

    constructor() {
        this.store = new Map();
        this.operationHistory = [];
    }

    async createIntegration(entities: any, userId: string, config: any) {
        const id = uuid();
        const record = {
            id,
            _id: id,
            entitiesIds: entities,
            userId: userId,
            config,
            version: '0.0.0',
            status: 'NEW',
            messages: {} as Record<string, any[]>,
        };
        this.store.set(id, record);
        this.operationHistory.push({ operation: 'create', id, userId, config });
        return record;
    }

    async findIntegrationById(id: string) {
        const rec = this.store.get(id);
        this.operationHistory.push({ operation: 'findById', id, found: !!rec });
        if (!rec) return null;
        return rec;
    }

    async findIntegrationsByUserId(userId: string) {
        const results = Array.from(this.store.values()).filter(r => r.userId === userId);
        this.operationHistory.push({ operation: 'findByUserId', userId, count: results.length });
        return results;
    }

    async findIntegrationByUserId(userId: string) {
        const record = Array.from(this.store.values()).find((r) => r.userId === userId);
        this.operationHistory.push({
            operation: 'findSingleByUserId',
            userId,
            found: !!record,
        });
        return record || null;
    }

    async updateIntegrationMessages(id: string, type: string, title: string, body: string, timestamp: any) {
        const rec = this.store.get(id);
        if (!rec) {
            this.operationHistory.push({ operation: 'updateMessages', id, success: false });
            return false;
        }
        if (!rec.messages[type]) rec.messages[type] = [];
        rec.messages[type].push({ title, message: body, timestamp });
        this.operationHistory.push({ operation: 'updateMessages', id, type, success: true });
        return true;
    }

    async updateIntegrationConfig(id: string, config: any) {
        const rec = this.store.get(id);
        if (!rec) {
            this.operationHistory.push({ operation: 'updateConfig', id, success: false });
            throw new Error(`Integration with id ${id} not found`);
        }
        rec.config = config;
        this.operationHistory.push({ operation: 'updateConfig', id, success: true });
        return rec;
    }

    async deleteIntegrationById(id: string) {
        const existed = this.store.has(id);
        const result = this.store.delete(id);
        this.operationHistory.push({ operation: 'delete', id, existed, success: result });
        return result;
    }

    async updateIntegrationStatus(id: string, status: string) {
        const rec = this.store.get(id);
        if (rec) {
            rec.status = status;
            this.operationHistory.push({ operation: 'updateStatus', id, status, success: true });
        } else {
            this.operationHistory.push({ operation: 'updateStatus', id, status, success: false });
        }
        return !!rec;
    }

    getOperationHistory() {
        return [...this.operationHistory];
    }

    clearHistory() {
        this.operationHistory = [];
    }
}
