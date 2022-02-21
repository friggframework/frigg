class MockApi {
    constructor() {}

    async createFolder() {
        return require('./folders/createFolder');
    }

    async listFolders() {
        return require('./folders/listFolders');
    }

    async createAccountList() {
        return require('./accountLists/createAccountList');
    }

    async listAccountLists() {
        return require('./accountLists/listAccountLists');
    }

    async addAccountsToList() {
        return require('./accountLists/addAccountsToList');
    }

    async removeAccountsFromList() {
        return require('./accountLists/removeAccountsFromList');
    }
}
