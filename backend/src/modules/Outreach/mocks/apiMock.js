class MockApi {
    constructor() {}

    /** * Accounts ** */

    async listAccounts() {
        return require('./accounts/listAccounts');
    }
    /** * Tasks ** */

    async createTask() {
        return require('./tasks/createTask');
    }

    async getTasks() {
        return require('./tasks/getTasks');
    }

    async deleteTask() {
        return require('./tasks/deleteTask');
    }

    async updateTask() {
        return require('./tasks/updateTask');
    }
}

module.exports = MockApi;
