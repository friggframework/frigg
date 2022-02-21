class MockApi {
    constructor() {}

    /*** Contacts ***/

    async listContacts() {
        return require('./contacts/listContacts');
    }

    /*** Contact Lists ***/

    async createContactList() {
        return require('./contactLists/createContactList');
    }

    async updateContactList() {
        return require('./contactLists/updateContactList');
    }

    async deleteContactList() {
        return require('./contactLists/deleteContactList');
    }

    /*** Custom Schemas ***/

    async createCustomObjectSchema() {
        return require('./customSchema/createCustomSchema');
    }

    async deleteCustomObjectSchema() {
        return require('./customSchema/deleteCustomSchema');
    }

    async getCustomObjectSchema() {
        return require('./customSchema/getCustomSchema');
    }

    async listCustomObjectSchemas() {
        return require('./customSchema/listCustomSchemas');
    }

    async updateCustomObjectSchema() {
        return require('./customSchema/updateCustomSchema');
    }

    /*** Custom Objects ***/

    async createCustomObject() {
        return require('./customObjects/createCustomObject');
    }

    async bulkCreateCustomObjects() {
        return require('./customObjects/bulkCreateCustomObject');
    }

    async deleteCustomObject() {
        return require('./customObjects/deleteCustomObject');
    }

    async bulkArchiveCustomObjects() {
        return '';
    }

    async getCustomObjectByID() {
        return require('./customObjects/getCustomObjectByID');
    }

    async listCustomObjects() {
        return require('./customObjects/listCustomObjects');
    }

    async updateCustomObject() {
        return require('./customObjects/updateCustomObject');
    }
}

module.exports = MockApi;
