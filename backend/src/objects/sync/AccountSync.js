const Sync = require('../../base/objects/sync/Sync');
class AccountSync extends Sync {
    static Config = {
        name: 'AccountSync',
        keys: [
            'accountName',
            'domain',
            'partner',
            'partnerPopulation',
            'population',
        ],
        matchOn: ['domain'],
        moduleMap: {
            crossbeam: {
                accountName: (obj) => {
                    return obj.accountName;
                },
                domain: (obj) => {
                    return obj.domain;
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
                accountName: (obj) => {
                    return obj.accountName;
                },
                domain: (obj) => {
                    return obj.domain;
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
                return {
                    accountName: obj.accountName,
                    domain: obj.domain,
                    partner: obj.partner,
                    partnerPopulation: obj.partnerPopulation,
                    population: obj.population,
                };
            },
            monday: (obj) => {
                return {
                    accountName: obj.accountName,
                    domain: obj.domain,
                    partner: obj.partner,
                    partnerPopulation: obj.partnerPopulation,
                    population: obj.population,
                };
            },
        },
    };

    constructor(params) {
        super(params);
    }
}

module.exports = AccountSync;
