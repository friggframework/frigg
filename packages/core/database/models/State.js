const { mongoose } = require('../mongoose');

const schema = new mongoose.Schema({
  state: { type: mongoose.Schema.Types.Mixed }
});

const State = mongoose.models.State || mongoose.model('State', schema);

module.exports = { State };
