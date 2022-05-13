class MockApi {
    constructor() {}

    /** * Deals ** */

    async listDeals() {
        return require('./deals/listDeals');
    }
    /** * Activities ** */

    async createActivity() {
        return require('./activities/createActivity');
    }

    async listActivities() {
        return require('./activities/listActivities');
    }

    async deleteActivity() {
        return require('./activities/deleteActivity');
    }

    async updateActivity() {
        return require('./activities/updateActivity');
    }
}

module.exports = MockApi;
