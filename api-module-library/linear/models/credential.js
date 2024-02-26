const { Credential: Parent, mongoose } = require('@friggframework/core-rollup');
const schema = new mongoose.Schema({
    access_token: {
        type: String,
        trim: true,
        lhEncrypt: true,
    },
    expires_at: { type: Number },
});
const name = 'LinearCredential';
const Credential = Parent.discriminators?.[name] || Parent.discriminator(name, schema);
module.exports = { Credential };
