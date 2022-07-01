const mongoose = require('mongoose');
const { Credential: Parent } = require('@friggframework/module-plugin');

const schema = new mongoose.Schema({
    // Clyde Access Details
    clientKey: {
        type: String,
        trim: true,
        unique: true,
    },
    secret: {
        type: String,
        trim: true,
        lhEncrypt: true,
    },
});

const Credential = Parent.discriminator('clydeCredentials', schema);
module.exports = { Credential };
