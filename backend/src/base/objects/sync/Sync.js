const md5 = require('md5');
const LHBaseClass = require('../../LHBaseClass');
const LHModuleManager = require('../../managers/LHModuleManager');
const { debug } = require('../../../utils/logger');

class Sync extends LHBaseClass {
    static Config = {
        name: 'Sync',

        // an array of keys we will use to form an object and then hash it. Order matters here
        // because it will effect how the hash results
        keys: [],

        // matchOn is an array of keys that make the variable unique when combined together
        // and is used to sync with the other objects
        // matchOn keys _have_ to have a value, otherwise the object is not considered a match
        matchOn: [],

        // a key value mapping of module to then a list of keys that will map to
        // an a function that takes in the module object and return the value from it
        //  format as follows:
        // {
        //      ModuleName:{
        //          firstName:(moduleObject)=>{moduleObject['name'][0]},
        //          lastName:(moduleObject)=>{moduleObject['name'][1]},
        //      },
        //      ....
        // }
        moduleMap: {},
        reverseModuleMap: {},
    };
    constructor(params) {
        super(params);
        this.data = {};

        let data = this.getParam(params, 'data');
        this.moduleName = this.getParam(params, 'moduleName');
        this.dataIdentifier = this.getParam(params, 'dataIdentifier');
        this.useMapping = this.getParam(params, 'useMapping', true); // Use with caution...

        this.dataIdentifierHash = this.constructor.hashJSON(
            this.dataIdentifier
        );

        if (this.useMapping) {
            for (let key of this.constructor.Config.keys) {
                this.data[key] =
                    this.constructor.Config.moduleMap[this.moduleName][key](
                        data
                    );
            }
        } else {
            this.data = data;
        }

        // matchHash is used to find matches between two sync objects
        // Match data _has_ to have a value
        const matchHashData = [];
        this.missingMatchData = false;
        for (const key of this.constructor.Config.matchOn) {
            if (!this.data[key]) {
                this.missingMatchData = true;
                debug(`Data key of ${key} was missing from MatchOn`);
            }

            matchHashData.push(this.data[key]);
        }
        this.matchHash = this.constructor.hashJSON(matchHashData);

        this.syncId = null;
    }

    equals(syncObj) {
        return this.matchHash === syncObj.matchHash;
    }
    dataKeyIsReplaceable(key) {
        return this.data[key] === null || this.data[key] === '';
    }

    isModuleInMap(moduleName) {
        return this.constructor.Config.moduleMap[name];
    }

    getName() {
        return this.constructor.Config.name;
    }

    getHashData(params) {
        let omitEmptyStringsFromData = this.getParam(
            params,
            'omitEmptyStringsFromData',
            false
        );
        let orderedData = [];
        for (let key of this.constructor.Config.keys) {
            if (omitEmptyStringsFromData && this.data[key] === '') {
                this.data[key] = undefined;
            }
            orderedData.push(this.data[key]);
        }

        return this.constructor.hashJSON(orderedData);
    }

    setSyncId(syncId) {
        this.syncId = syncId;
    }

    reverseModuleMap(moduleName) {
        return this.constructor.Config.reverseModuleMap[moduleName](this.data);
    }

    static hashJSON(data) {
        let dataString = JSON.stringify(data, null, 2);
        return md5(dataString);
    }
}

module.exports = Sync;
