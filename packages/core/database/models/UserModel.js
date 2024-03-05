const { mongoose } = require('../mongoose');

const schema = new mongoose.Schema({}, {timestamps: true})

const UserModel = mongoose.models.User || mongoose.model('User',schema)

module.exports = { UserModel: UserModel };
