const { v4: uuid } = require('uuid');

class TestIntegrationRepository {
    constructor() {
        this.store = new Map();
        this.operationHistory = [];
    }

    async createIntegration(entities, userId, config) {
        const id = uuid();
        const record = {
            id,
            _id: id,
            entitiesIds: entities,
            userId: userId,
            config,
            version: '0.0.0',
            status: 'NEW',
            messages: {},
        };
        this.store.set(id, record);
        this.operationHistory.push({ operation: 'create', id, userId, config });
        return record;
    }

    async findIntegrationById(id) {
        const rec = this.store.get(id);
        this.operationHistory.push({ operation: 'findById', id, found: !!rec });
        if (!rec) return null;
        return rec;
    }

    async findIntegrationsByUserId(userId) {
        const results = Array.from(this.store.values()).filter(r => r.userId === userId);
        this.operationHistory.push({ operation: 'findByUserId', userId, count: results.length });
        return results;
    }

    async findIntegrationByUserId(userId) {
        const record = Array.from(this.store.values()).find((r) => r.userId === userId);
        this.operationHistory.push({
            operation: 'findSingleByUserId',
            userId,
            found: !!record,
        });
        return record || null;
    }

    async updateIntegrationMessages(id, type, title, body, timestamp) {
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

    async updateIntegrationConfig(id, config) {
        const rec = this.store.get(id);
        if (!rec) {
            this.operationHistory.push({ operation: 'updateConfig', id, success: false });
            return false;
        }
        rec.config = config;
        this.operationHistory.push({ operation: 'updateConfig', id, success: true });
        return true;
    }

    async deleteIntegrationById(id) {
        const existed = this.store.has(id);
        const result = this.store.delete(id);
        this.operationHistory.push({ operation: 'delete', id, existed, success: result });
        return result;
    }

    async updateIntegrationStatus(id, status) {
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

module.exports = { TestIntegrationRepository }; 
