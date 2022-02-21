const Sync = require('../../../../src/base/objects/sync/Sync');
class MockSync extends Sync {
    static Config = {
        name: 'MockSync',
        keys: ['firstName', 'lastName', 'email'],
        matchOn: ['email'],
        moduleMap: {
            mockModuleOne: {
                firstName: (obj) => {
                    return obj.firstName;
                },
                lastName: (obj) => {
                    return obj.lastName;
                },
                email: (obj) => {
                    return obj.email;
                },
            },
            mockModuleTwo: {
                firstName: (obj) => {
                    return obj.name[0];
                },
                lastName: (obj) => {
                    return obj.name[1];
                },
                email: (obj) => {
                    return obj.email;
                },
            },
        },
        reverseModuleMap: {
            mockModuleOne: (obj) => {
                return obj;
            },
            mockModuleTwo: (obj) => {
                return {
                    name: [obj.firstName, obj.lastName],
                    email: obj.email,
                };
            },
        },
    };

    constructor(params) {
        super(params);
    }
}

module.exports = MockSync;
