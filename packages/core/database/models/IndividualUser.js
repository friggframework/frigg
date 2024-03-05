const { mongoose } = require('../mongoose');
const bcrypt = require('bcryptjs');
const { UserModel: Parent } = require('./UserModel');

const collectionName = 'IndividualUser';

const schema = new mongoose.Schema({
    email: { type: String },
    username: { type: String, unique: true },
    hashword: { type: String },
    appUserId: { type: String },
    organizationUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
});

schema.pre('save', async function () {
    if (this.hashword) {
        this.hashword = await bcrypt.hashSync(
            this.hashword,
            parseInt(this.schema.statics.decimals)
        )
    }
})

schema.static({
    decimals: 10,
    update: async function (id, options) {
        if ('password' in options) {
            options.hashword = await bcrypt.hashSync(
                options.password,
                parseInt(this.decimals)
            );
            delete options.password;
        }
        return this.findOneAndUpdate(
            {_id: id},
            options,
            {new: true, useFindAndModify: true}
        );
    },
    getUserByUsername: async function (username) {
        let getByUser;
        try{
            getByUser = await this.find({username});
        } catch (e) {
            console.log('oops')
        }

        if (getByUser.length > 1) {
            throw new Error(
                'Unique username or email? Please reach out to our developers'
            );
        }

        if (getByUser.length === 1) {
            return getByUser[0];
        }
    },
    getUserByAppUserId: async function (appUserId) {
        const getByUser = await this.find({ appUserId });

        if (getByUser.length > 1) {
            throw new Error(
                'Supposedly using a unique appUserId? Please reach out to our developers'
            );
        }


        if (getByUser.length === 1) {
            return getByUser[0];
        }
    }
})

const IndividualUser = Parent.discriminators?.IndividualUser || Parent.discriminator(collectionName, schema);

module.exports = {IndividualUser};
