class TestModuleRepository {
    constructor() {
        this.entities = new Map();
    }

    addEntity(entity) {
        this.entities.set(entity.id, entity);
    }

    async findEntityById(id) {
        return this.entities.get(id);
    }

    async findEntitiesByIds(ids) {
        return ids.map((id) => this.entities.get(id));
    }

    async findEntity(filter) {
        if (!filter || typeof filter !== 'object') {
            return null;
        }

        if (filter.id && this.entities.has(filter.id)) {
            return this.entities.get(filter.id);
        }

        if (filter.externalId) {
            for (const entity of this.entities.values()) {
                if (entity.externalId === filter.externalId) {
                    return entity;
                }
            }
        }

        return null;
    }
}

module.exports = { TestModuleRepository }; 
