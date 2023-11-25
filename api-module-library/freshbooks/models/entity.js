const { mongoose } = require('@friggframework/database/mongoose');
const { Schema } = mongoose;
const { Entity: Parent } = require('@friggframework/module-plugin');

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
