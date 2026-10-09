const test = require('./test');
const { createFriggInfrastructure } = require('./infrastructure');

module.exports = {
    createFriggInfrastructure,
    ...test,
};
