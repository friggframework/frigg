const { mongoose } = require('@friggframework/core');
const { Schema, model, models} = mongoose;
const schema1 = new Schema({}, {timestamps: true})

const User = models.User || model('User',schema1)

const schema = new Schema({
    appUserId: { type: String, unique: true },
    name: { type: String },
    email: { type: String },
    organizationUser: { type: Schema.Types.ObjectId, ref: 'User' },
});

schema.static({
    //decimals: 10,
    /*update: async function (id, options) {
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
    },*/
    getUserByUsername: async function (username) {
        let getByUser;
        try {
            getByUser = await this.find({ username });
        } catch (e) {
            console.log('oops');
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
    },
});

const IndividualUser =
    User.discriminators?.IndividualUser ||
User.discriminator('IndividualUser', schema);
module.exports = { IndividualUser };
