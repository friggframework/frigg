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
}

module.exports = { TestModuleRepository }; 