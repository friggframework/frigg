const md5 = require("md5");
const { get } = require('../assertions');

/**
 * @file This file is meant to be the thing that enforces proper use of
 * the Association model.
 * For now, we're going to use the model directly and worry about proper use
 * later...
 */
class Association {
  static Config = {
    name: "Association",

    reverseModuleMap: {},
  };
  constructor(params) {
    this.data = {};

    let data = get(params, "data");
    this.moduleName = get(params, "moduleName");
    this.dataIdentifier = get(params, "dataIdentifier");

    this.dataIdentifierHash = this.constructor.hashJSON(this.dataIdentifier);

    for (let key of this.constructor.Config.keys) {
      this.data[key] =
        this.constructor.Config.moduleMap[this.moduleName][key](data);
    }

    // matchHash is used to find matches between two sync objects
    let matchHashData = [];
    for (let key of this.constructor.Config.matchOn) {
      matchHashData.push(this.data[key]);
    }
    this.matchHash = this.constructor.hashJSON(matchHashData);

    this.syncId = null;
  }

  equals(syncObj) {
    return this.matchHash === syncObj.matchHash;
  }
  dataKeyIsReplaceable(key) {
    return this.data[key] === null || this.data[key] === "";
  }

  isModuleInMap(moduleName) {
    return this.constructor.Config.moduleMap[name];
  }

  getName() {
    return this.name;
  }

  getHashData() {
    let orderedData = [];
    for (let key of this.constructor.Config.keys) {
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

module.exports = Association;
