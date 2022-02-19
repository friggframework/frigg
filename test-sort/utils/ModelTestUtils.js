const mongoose = require('mongoose');

class ModelTestUtils {
    static compareDBObjectWithObject(modelObject, compareObject) {
        for (const key in compareObject) {
            let objVal = modelObject[key];

            if (objVal instanceof Date) {
                objVal = objVal.toISOString();
            } else if (objVal instanceof mongoose.Types.ObjectId) {
                objVal = objVal._id.toString();
            }
            expect(compareObject[key]).toBe(objVal);
        }
    }

    static async wipeDB() {
        const collections = await mongoose.connection.db.collections();

        for (const collection of collections) {
            await collection.remove();
        }
    }
}

module.exports = ModelTestUtils;
