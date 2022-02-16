const mongoose = require('mongoose');

const createModel = (collectionName, schema, parent) => {
    if (!parent || !parent.model) {
        return mongoose.model(collectionName, schema);
    }
    return parent.model.discriminator(collectionName, schema);
};

module.exports = { createModel };
