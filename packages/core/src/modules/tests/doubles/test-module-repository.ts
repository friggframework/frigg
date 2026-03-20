export class TestModuleRepository {
    entities: Map<string, any>;

    constructor() {
        this.entities = new Map();
    }

    addEntity(entity: any) {
        this.entities.set(entity.id, entity);
    }

    async findEntityById(id: string) {
        return this.entities.get(id);
    }

    async findEntitiesByIds(ids: string[]) {
        return ids.map((id) => this.entities.get(id));
    }

    async findEntity(filter: any) {
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
