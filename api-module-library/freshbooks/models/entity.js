const { Entity: Parent, mongoose } = require('@friggframework/core-rollup');
const { Schema } = mongoose;

const schema = new Schema({
    account_id: {
        type: String,
    },
    externalId: {
        type: String,
    },
    title: {
        type: String,
    }
});
const name = 'FreshBookEntity';
const Entity =
Parent.discriminators?.[name]  || Parent.discriminator(name, schema);
module.exports = { Entity };
