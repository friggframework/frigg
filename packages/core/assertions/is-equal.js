const { ObjectId } = require('mongodb');

const expectShallowEqualDbObject = (modelObject, compareObject) => {
    for (const key in compareObject) {
        let objVal = modelObject[key];

        if (objVal instanceof Date) {
            objVal = objVal.toISOString();
        } else if (objVal instanceof ObjectId) {
            objVal = objVal.toString();
        }

        expect(compareObject[key]).toBe(objVal);
    }
};

// TODO not sure how much this is needed, but could rewrite with _.isEqualWith for deep equality with custom checks.

module.exports = { expectShallowEqualDbObject };
