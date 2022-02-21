const Sync = require('../../base/objects/sync/Sync');
class LeadSync extends Sync {
    static Config = {
        name: 'LeadSync',
        keys: [
            'firstName',
            'lastName',
            'email',
            'title',
            'partner',
            'partnerPopulation',
            'population',
        ],
        matchOn: ['email'],
        moduleMap: {
            crossbeam: {
                // Need to verify that keys are correct or update them
                firstName: (obj) => {
                    return obj.firstName;
                },
                lastName: (obj) => {
                    return obj.lastName;
                },
                email: (obj) => {
                    return obj.email;
                },
                title: (obj) => {
                    return obj.title;
                },
                partner: (obj) => {
                    return obj.partner;
                },
                partnerPopulation: (obj) => {
                    return obj.partnerPopulation;
                },
                population: (obj) => {
                    return obj.population;
                },
            },
            monday: {
                // Need to verify that keys are correct or update them
                firstName: (obj) => {
                    return obj.firstName;
                },
                lastName: (obj) => {
                    return obj.lastName;
                },
                email: (obj) => {
                    return obj.email;
                },
                title: (obj) => {
                    return obj.title;
                },
                partner: (obj) => {
                    return obj.partner;
                },
                partnerPopulation: (obj) => {
                    return obj.partnerPopulation;
                },
                population: (obj) => {
                    return obj.population;
                },
            },
        },
        reverseModuleMap: {
            crossbeam: (obj) => {
                let res = {
                    firstName: obj.firstName,
                    lastName: obj.lastName,
                    partner: obj.partner,
                    partnerPopulation: obj.partnerPopulation,
                    email: obj.email,
                    title: obj.title,
                    population: obj.population,
                };

                return res;
            },
            monday: (obj) => {
                let res = {
                    firstName: obj.firstName,
                    lastName: obj.lastName,
                    partner: obj.partner,
                    partnerPopulation: obj.partnerPopulation,
                    email: obj.email,
                    title: obj.title,
                    population: obj.population,
                };
                return res;
            },
        },
    };

    constructor(params) {
        super(params);
    }
}

module.exports = LeadSync;
