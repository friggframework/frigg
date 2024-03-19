const { Entity: Parent, mongoose } = require('@friggframework/core');

const schema = new mongoose.Schema({});
const name = 'LinearEntity';
const Entity =
Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { Entity };
