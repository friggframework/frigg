const { createHandler } = require('./createHandler');

const MondayQueuer = require('../workers/crons/MondayQueuer');

module.exports.handler = createHandler({
    eventName: 'Monday Queuer',
    isUserFacingResponse: false,
    method: async (event) => {
        const lhWorker = new MondayQueuer();
        await lhWorker._run();
        return {
            message: 'Successfully Started the Monday.com Queuer',
            input: event,
        };
    },
});
