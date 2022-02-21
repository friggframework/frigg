const Sync = require('../../base/objects/sync/Sync');

class ReportRecordSync extends Sync {
    static Config = {
        name: 'ReportRecordSync',
        keys: ['data'],
        matchOn: ['data'],
        moduleMap: {
            crossbeam: {
                data: (obj) => obj.data,
            },
            monday: {
                data: (obj) => obj.data,
            },
        },
        reverseModuleMap: {
            crossbeam: (obj) => ({
                data: obj.data,
            }),
            monday: (obj) => ({
                data: obj.data,
            }),
        },
    };

    constructor(params) {
        super(params);
    }
}

module.exports = ReportRecordSync;
