const parsers = require('./parsers');
const policy = require('./policy');

module.exports = { ...parsers, ...policy };
