const { mongoose } = require('../mongoose');
const { UserModel: Parent } = require('./UserModel');

const collectionName = 'OrganizationUser';

const schema = new mongoose.Schema({
    appOrgId: { type: String, required: true, unique: true },
    name: { type: String },
});

schema.static({
    getUserByAppOrgId: async function (appOrgId) {
        const getByUser = await this.find({ appOrgId });

        if (getByUser.length > 1) {
            throw new Error(
                'Supposedly using a unique appOrgId? Please reach out to our developers'
            );
        }

        if (getByUser.length === 1) {
            return getByUser[0];
        }
    }
})

const OrganizationUser = Parent.discriminators?.OrganizationUser || Parent.discriminator(collectionName, schema);

module.exports = {OrganizationUser};
